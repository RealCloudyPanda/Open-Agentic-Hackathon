import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildStatic } from '../scripts/build-static.mjs';
import { buildSite, sriDigest } from '../scripts/build-networks.mjs';

test('static packages validate after origin replacement and retain runtime bytes', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'relay-static-'));
  try {
    const config = JSON.parse(await readFile('sites.config.json', 'utf8'));
    config.sites.forEach((s) => { s.publicOrigin = `https://${s.id}.example.test`; });
    const file = path.join(tmp, 'config.json');
    await writeFile(file, JSON.stringify(config));
    const out = await buildStatic(file, path.join(tmp, 'out'));
    for (const s of config.sites) {
      const folder = path.join(out, s.id);
      const { errors, outputs } = await buildSite(folder);
      assert.deepEqual(errors, []);
      for (const [f, text] of outputs) assert.equal(await readFile(f, 'utf8'), text);
      const manifest = JSON.parse(await readFile(path.join(folder, 'agent-manifest.json'), 'utf8'));
      assert.equal(manifest.coded_tools.integrity, sriDigest(await readFile(path.join(folder, manifest.coded_tools.bundle), 'utf8')));
      assert.deepEqual(await readFile(path.join(folder, 'runtime/kernel.js')), await readFile('vendor/nsdeploy-runtime/kernel.js'));
      assert.ok(!(await readFile(path.join(folder, 'agent-manifest.json'), 'utf8')).includes('http://localhost:5174'));
    }
    await assert.rejects(buildStatic(file, path.resolve('sites/spec-desk')), /outside the source/);
    config.sites[1].id = config.sites[0].id;
    await writeFile(file, JSON.stringify(config));
    await assert.rejects(buildStatic(file, path.join(tmp, 'bad')), /uniquely name/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
