import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { canonical, abiHash, safePath } from '../src/integrity.ts';
import { decodeCanvas, validPixel, isUnknownChain, errorMessage, PALETTE } from '../src/model.ts';
import { PaintFeed, simulatePaint } from '../src/chain.ts';

const handoff = JSON.parse(readFileSync(new URL('../deployment/handoff.json', import.meta.url)));
const abi = JSON.parse(readFileSync(new URL('../../docs/abi/PixelCommons.json', import.meta.url)));
const deployment = { contract: { ...handoff.contracts[0], abi }, chain: { id: handoff.chainId } };
const account = `0x${'a1'.repeat(20)}`; // Mock wallet only; never used for live-chain validation.
const hash = `0x${'b2'.repeat(32)}`;

test('ABI canonicalization ignores object key order, preserves array order and matches handoff', () => {
  assert.equal(canonical({ b: [3, { y: 2, x: 1 }], a: 0 }), '{"a":0,"b":[3,{"x":1,"y":2}]}');
  assert.equal(abiHash(abi), handoff.contracts[0].abiHash);
  assert.notEqual(abiHash([...abi].reverse()), abiHash(abi));
});
test('asset paths reject escapes, URLs, absolute paths, dot segments and empty segments', () => {
  for (const bad of ['../a', 'a/../b', '/index.html', 'https://x/a', './a', 'a//b', 'a\\b', '']) assert.equal(safePath(bad), false, bad);
  assert.equal(safePath('assets/index-1.js'), true);
});
test('canvas decodes exactly 4096 individual color bytes in row-major order', () => {
  const bytes = new Uint8Array(4096); bytes[0] = 1; bytes[63] = 2; bytes[64] = 3; bytes[4095] = 15;
  const decoded = decodeCanvas(`0x${Buffer.from(bytes).toString('hex')}`);
  assert.deepEqual([decoded[0], decoded[63], decoded[64], decoded[4095]], [1, 2, 3, 15]);
  assert.equal(PALETTE.length, 16); assert.equal(PALETTE[0].hex, '#ffffff');
  assert.throws(() => decodeCanvas('0x00')); assert.throws(() => decodeCanvas(`0x${'10'.repeat(4096)}`));
});
test('coordinate bounds, integer checks and invalid simulation inputs fail before any RPC', async () => {
  assert(validPixel({ x: 0, y: 63 })); assert(validPixel({ x: 63, y: 0 }));
  for (const pixel of [{ x: -1, y: 0 }, { x: 64, y: 1 }, { x: 1.1, y: 2 }, { x: NaN, y: 0 }]) {
    assert(!validPixel(pixel)); await assert.rejects(simulatePaint({}, deployment, account, pixel, 1));
  }
  await assert.rejects(simulatePaint({}, deployment, account, { x: 1, y: 1 }, 16));
});
test('wallet errors have recoverable messages and nested unknown-chain errors are recognized', () => {
  assert(isUnknownChain({ data: { originalError: { code: 4902 } } }));
  assert(isUnknownChain({ message: 'Unrecognized chain ID' }));
  assert(!isUnknownChain({ code: 4001 }));
  assert.match(errorMessage({ cause: { code: 4001 } }), /declined/);
  assert.match(errorMessage({ code: -32002 }), /already open/);
  assert.match(errorMessage(new Error('insufficient funds for gas')), /test ETH/);
});
function log(index, block = 3000n) {
  return { data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(index % 16)]),
    topics: encodeEventTopics({ abi, eventName: 'Painted', args: { painter: account, x: BigInt(index), y: 2n } }),
    blockHash: hash, blockNumber: block, transactionHash: hash, logIndex: index, removed: false };
}
test('activity returns latest 20 ordered events, preserves real fields, and replaces reorg overlap', async () => {
  let logs = Array.from({ length: 25 }, (_, i) => log(i));
  const reader = { getContractEvents: async () => logs, getCode: async () => '0x6000' };
  const feed = new PaintFeed(reader, deployment);
  const first = await feed.refresh(3000n);
  assert.equal(first.events.length, 20); assert.equal(first.events[0].x, 24); assert.equal(first.events[19].x, 5);
  assert.equal(first.events[0].painter.toLowerCase(), account); assert.equal(first.events[0].y, 2);
  logs = [log(26, 3001n)];
  const reorg = await feed.refresh(3001n);
  assert.equal(reorg.events.length, 1); assert.equal(reorg.events[0].x, 26);
});
test('activity scans backward until contract birth without a duplicate deployment block configuration', async () => {
  const ranges = [];
  const reader = { getContractEvents: async args => { ranges.push([args.fromBlock, args.toBlock]); return []; }, getCode: async ({ blockNumber }) => blockNumber > 4000n ? '0x6000' : '0x' };
  const feed = new PaintFeed(reader, deployment);
  await feed.refresh(8000n);
  const final = await feed.refresh(8001n);
  assert(final.complete); assert.deepEqual(final.events, []);
  assert(ranges.some(([from, to]) => from === 4000n && to === 5999n));
});
test('RPC chain mismatch or missing code prevents paint simulation', async () => {
  await assert.rejects(simulatePaint({ getChainId: async () => 1 }, deployment, account, { x: 0, y: 0 }, 0), /verification/);
  await assert.rejects(simulatePaint({ getChainId: async () => handoff.chainId, getCode: async () => '0x' }, deployment, account, { x: 0, y: 0 }, 0), /code/);
});
