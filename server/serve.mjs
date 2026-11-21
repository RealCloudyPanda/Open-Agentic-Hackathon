import http from "node:http";
import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");

export const WORKER_CSP = "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".hocon": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export function isPublicArtifact(urlPath) {
  const base = path.posix.basename(urlPath);
  if (base === "agent-manifest.json" || base === "links.json") return true;
  if (base.endsWith(".network.json") || base.endsWith(".hocon")) return true;
  if (/^\/(.*\/)?tools\/[^/]+\.js$/.test(urlPath)) return true;
  if (urlPath.startsWith("/drills/") && base.endsWith(".json")) return true;
  if (urlPath.startsWith("/.well-known/") && base.endsWith(".json")) return true;
  return false;
}

export function loadConfig(root = ROOT) {
  return readFile(path.join(root, "sites.config.json"), "utf8").then(JSON.parse);
}

async function resolveFile(root, site, urlPath) {
  let mountDir;
  let rel;
  if (urlPath.startsWith("/runtime/")) {
    mountDir = path.join(root, "vendor/nsdeploy-runtime");
    rel = urlPath.slice("/runtime/".length);
  } else if (urlPath.startsWith("/shared/")) {
    mountDir = path.join(root, "shared");
    rel = urlPath.slice("/shared/".length);
  } else {
    mountDir = path.join(root, site.folder);
    rel = urlPath.slice(1);
  }
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const realMount = await realpath(mountDir);
  const candidate = path.resolve(realMount, rel);
  if (candidate !== realMount && !candidate.startsWith(realMount + path.sep)) return null;
  try {
    const real = await realpath(candidate);
    if (!real.startsWith(realMount + path.sep)) return null;
    const info = await stat(real);
    if (info.isDirectory()) {
      const idx = path.join(real, "index.html");
      await stat(idx);
      return idx;
    }
    return real;
  } catch {
    return undefined;
  }
}

function logLine(site, req, status) {
  const cookieNames = (req.headers.cookie || "")
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter(Boolean);
  return {
    site: site.id,
    method: req.method,
    path: req.url.split("?")[0],
    from: req.headers.origin || "-",
    auth: req.headers.authorization ? "yes" : "no",
    cookies: cookieNames.length ? cookieNames.join(",") : "none",
    status,
  };
}

export function formatLog(e) {
  return `[${e.site}] ${e.method} ${e.path} from=${e.from} auth=${e.auth} cookies=${e.cookies} ${e.status}`;
}

function makeHandler(root, site, onLog) {
  return async (req, res) => {
    let status = 500;
    try {
      const rawPath = req.url.split("?")[0];
      let urlPath;
      try {
        urlPath = decodeURIComponent(rawPath);
      } catch {
        urlPath = null;
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (!urlPath || !urlPath.startsWith("/") || urlPath.includes("\0") || urlPath.split("/").includes("..")) {
        status = 404;
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
      const isPublic = isPublicArtifact(urlPath);
      if (isPublic) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        status = 204;
        if (isPublic) res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        res.writeHead(204).end();
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        status = 405;
        res.writeHead(405, { Allow: "GET, HEAD, OPTIONS" }).end();
        return;
      }
      const file = await resolveFile(root, site, urlPath);
      if (!file) {
        status = 404;
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
      if (urlPath === "/runtime/sandbox-worker.js") res.setHeader("Content-Security-Policy", WORKER_CSP);
      const body = await readFile(file);
      status = 200;
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": body.length,
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (err) {
      status = 500;
      if (!res.headersSent) res.writeHead(500).end("Server error");
    } finally {
      onLog?.(logLine(site, req, status));
    }
  };
}

export async function startServers({ root = ROOT, quiet = false, onLog, ports = {} } = {}) {
  const config = await loadConfig(root);
  const servers = [];
  const sites = [];
  for (const site of config.sites) {
    const port = ports[site.id] ?? site.port;
    const log = (e) => {
      onLog?.(e);
      if (!quiet) console.log(formatLog(e));
    };
    const server = http.createServer(makeHandler(root, site, log));
    await new Promise((resolve, reject) => {
      server.once("error", (err) => {
        if (site.listen === "::1" && (err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT")) {
          reject(new Error(`[${site.id}] Cannot bind IPv6 loopback ::1 (${err.code}). Spec Relay needs three host names (127.0.0.1, localhost, [::1]); enable IPv6 loopback and retry.`));
        } else if (err.code === "EADDRINUSE") {
          reject(new Error(`[${site.id}] Port ${port} on ${site.listen} is already in use. Stop the other server and retry.`));
        } else reject(err);
      });
      server.listen(port, site.listen, resolve);
    });
    const actual = server.address().port;
    servers.push(server);
    sites.push({ ...site, port: actual, origin: `http://${site.host}:${actual}` });
  }
  return {
    servers,
    sites,
    close: () => Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }))),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quiet = process.argv.includes("--quiet");
  try {
    const { sites } = await startServers({ quiet });
    console.log("Spec Relay is running:");
    for (const s of sites) console.log(`  ${s.id.padEnd(13)} ${s.origin}/`);
    console.log("Open http://127.0.0.1:5173 to start. Ctrl+C stops all three.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
