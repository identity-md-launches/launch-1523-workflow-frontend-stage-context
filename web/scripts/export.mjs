import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { abiHash } from '../src/integrity.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const handoff = JSON.parse(await readFile(resolve(root, 'web/deployment/handoff.json'), 'utf8'));
const network = JSON.parse(await readFile(resolve(root, 'web/deployment/network.json'), 'utf8'));
const prepare = process.argv.includes('--prepare');
const out = resolve(root, prepare ? 'web/public' : 'dist');
await mkdir(resolve(out, 'abi'), { recursive: true });
const contracts = [];
for (const contract of handoff.contracts) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(contract.name)) throw new Error('Invalid contract name');
  const sourcePath = `docs/abi/${contract.name}.json`;
  const pinned = execFileSync('git', ['show', `${handoff.sourceCommit}:${sourcePath}`], { cwd: root, encoding: 'utf8' });
  const abi = JSON.parse(pinned);
  if (!Array.isArray(abi) || abiHash(abi) !== contract.abiHash) throw new Error(`Pinned ABI hash mismatch: ${contract.name}`);
  const abiPath = `abi/${contract.name}.json`;
  await writeFile(resolve(out, abiPath), pinned);
  contracts.push({ name: contract.name, address: contract.address, abiHash: contract.abiHash, abiPath });
}
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets: [],
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  ...network,
};
async function inventory(dir) {
  for (const entry of (await readdir(dir)).sort()) {
    const absolute = resolve(dir, entry);
    if ((await stat(absolute)).isDirectory()) await inventory(absolute);
    else if (entry !== 'imd-deployment.json') {
      const bytes = await readFile(absolute);
      if (bytes.length > 8388608) throw new Error('Asset exceeds 8 MiB');
      manifest.assets.push({ path: relative(out, absolute).split('\\').join('/'), sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await inventory(out);
if (manifest.assets.length > 128) throw new Error('Too many exported assets');
await writeFile(resolve(out, 'imd-deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Exported verified deployment configuration and ${manifest.assets.length} assets.`);
