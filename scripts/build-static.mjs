import path from 'node:path';
import { buildSite } from './build-networks.mjs';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function buildStatic(configFile, output = path.join(ROOT, 'dist')) {
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  const sites = config.sites;
  if (!Array.isArray(sites) || sites.length !== 3) throw new Error('Configure all three site origins.');
  const expectedIds = ['spec-desk', 'test-planner', 'risk-radar'];
  if (new Set(sites.map((s) => s.id)).size !== 3 || sites.some((s) => !expectedIds.includes(s.id))) throw new Error('Config must uniquely name spec-desk, test-planner and risk-radar.');
  const origins = sites.map((s) => {
    const url = new URL(s.publicOrigin);
    if (url.protocol !== 'https:' || url.origin !== s.publicOrigin || url.username || url.password) throw new Error('publicOrigin must be a bare HTTPS origin.');
    return url.origin;
  });
  if (new Set(origins).size !== 3) throw new Error('Three distinct public origins are required.');
  const source = JSON.parse(await readFile(path.join(ROOT, 'sites.config.json'), 'utf8'));
  const replacements = source.sites.map((s) => [s.origin, origins[sites.findIndex((v) => v.id === s.id)]]);
  if (replacements.some(([, value]) => !value)) throw new Error('Config must name spec-desk, test-planner and risk-radar.');
  const out = path.resolve(output);
  if (out === ROOT || ROOT.startsWith(out + path.sep) || (out.startsWith(ROOT + path.sep) && out !== path.join(ROOT, 'dist'))) throw new Error('Output must be dist or outside the source tree.');
  for (const site of source.sites) {
    const dest = path.join(out, site.id);
    await mkdir(dest, { recursive: true });
    await cp(path.join(ROOT, site.folder), dest, { recursive: true });
    await cp(path.join(ROOT, 'shared'), path.join(dest, 'shared'), { recursive: true });
    await cp(path.join(ROOT, 'vendor/nsdeploy-runtime'), path.join(dest, 'runtime'), { recursive: true });
    async function rewrite(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'runtime') continue; // vendored bytes remain unchanged
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await rewrite(file);
        else if (/\.(json|js|html|hocon)$/.test(entry.name)) {
          let text = await readFile(file, 'utf8');
          for (const [from, to] of replacements) text = text.split(from).join(to);
          await writeFile(file, text);
        }
      }
    }
    await rewrite(dest);
    // Rebuild after replacing origins: tools contain origin stamps covered by SRI.
    for (const folder of [dest, path.join(dest, 'handoff')]) {
      const { outputs, errors } = await buildSite(folder);
      if (errors.length) throw new Error(errors.join('\n'));
      for (const [file, text] of outputs) await writeFile(file, text);
    }
    await writeFile(path.join(dest, '_headers'), '/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n/runtime/sandbox-worker.js\n  Content-Security-Policy: default-src \'none\'; script-src blob:; connect-src \'none\'; worker-src \'none\'\n');
  }
  await writeFile(path.join(out, 'HOSTING.md'), 'Upload each named folder to its matching HTTPS origin. Apply _headers or equivalent CORS and worker CSP headers. No deployment was performed. Real hosting and model runs require owner verification.\n');
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  try { console.log(await buildStatic(process.argv.includes('--config') ? value('--config') : path.join(ROOT, 'sites.config.json'), process.argv.includes('--out') ? value('--out') : undefined)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
