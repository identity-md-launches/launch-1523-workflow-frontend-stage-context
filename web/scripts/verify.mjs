import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import assert from 'node:assert/strict';
import { abiHash, safePath } from '../src/integrity.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const config = await json('dist/imd-deployment.json');
const handoff = await json('web/deployment/handoff.json');
const network = await json('web/deployment/network.json');
for (const [source, copy] of [['deployment.json', handoff], ['network.json', network]]) {
  try { assert.deepEqual(await json(`.imd/reads/${source}`), copy); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const keys = ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash', 'contracts', 'assets', ...Object.keys(network), ...(handoff.poolKey ? ['poolKey'] : [])];
assert.deepEqual(Object.keys(config).sort(), keys.sort());
for (const key of ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash']) assert.deepEqual(config[key], handoff[key]);
assert.deepEqual(config.network, network.network);
assert.deepEqual(config.walletAddChain, network.walletAddChain);
assert.equal(config.network.chainId, config.chainId);
assert.equal(Number(config.walletAddChain.chainId), config.chainId);
assert.deepEqual(config.poolKey, handoff.poolKey);
assert.deepEqual(config.contracts.map(({ abiPath, ...contract }) => contract), handoff.contracts.map(({ name, address, abiHash }) => ({ name, address, abiHash })));
for (const contract of config.contracts) {
  assert(safePath(contract.abiPath));
  const abi = await json(`dist/${contract.abiPath}`);
  assert(Array.isArray(abi));
  assert.equal(abiHash(abi), contract.abiHash);
  const pinned = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${contract.name}.json`], { cwd: root, encoding: 'utf8' });
  assert.deepEqual(abi, JSON.parse(pinned));
}
const files = [];
let bytes = 0;
async function walk(dir) {
  for (const name of await readdir(dir)) {
    const path = resolve(dir, name);
    if ((await stat(path)).isDirectory()) await walk(path);
    else { files.push(relative(resolve(root, 'dist'), path)); bytes += (await stat(path)).size; }
  }
}
await walk(resolve(root, 'dist'));
assert.equal(new Set(config.assets.map(x => x.path)).size, config.assets.length);
assert.deepEqual(config.assets.map(x => x.path).sort(), files.filter(x => x !== 'imd-deployment.json').sort());
assert(config.assets.length <= 128);
for (const asset of config.assets) {
  assert(safePath(asset.path));
  assert(/^[0-9a-f]{64}$/.test(asset.sha256));
  const content = await readFile(resolve(root, 'dist', asset.path));
  assert(content.length <= 8388608);
  assert.equal(createHash('sha256').update(content).digest('hex'), asset.sha256, asset.path);
}
assert(bytes < 8 * 1024 * 1024, 'Export must leave submission room for source');
assert(!(await readFile(resolve(root, 'dist/index.html'), 'utf8')).match(/(?:src|href)="\/(?!\/)/));
console.log(JSON.stringify({ passed: true, assets: config.assets.length, exportBytes: bytes, abiHashes: config.contracts.map(x => x.abiHash), exactHandoff: true, relativeAssets: true }, null, 2));
