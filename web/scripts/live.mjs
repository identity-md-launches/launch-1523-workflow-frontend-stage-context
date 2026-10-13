import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http, keccak256 } from 'viem';
import assert from 'node:assert/strict';

const handoff = JSON.parse(await readFile(new URL('../deployment/handoff.json', import.meta.url), 'utf8'));
const config = JSON.parse(await readFile(new URL('../../dist/imd-deployment.json', import.meta.url), 'utf8'));
const contract = config.contracts[0];
const abi = JSON.parse(await readFile(new URL(`../../dist/${contract.abiPath}`, import.meta.url), 'utf8'));
const results = [];
for (const url of config.network.rpcUrls) {
  const reader = createPublicClient({ transport: http(url, { timeout: 12000, retryCount: 0 }) });
  try {
    const chainId = await reader.getChainId();
    assert.equal(chainId, config.chainId);
    const code = await reader.getCode({ address: contract.address });
    assert(code && code !== '0x');
    const args = { abi, address: contract.address };
    const [block, canvas, ...constants] = await Promise.all([
      reader.getBlock(), reader.readContract({ ...args, functionName: 'getCanvas' }),
      ...['WIDTH', 'HEIGHT', 'COLOR_COUNT', 'PIXEL_COUNT', 'COOLDOWN'].map(functionName => reader.readContract({ ...args, functionName })),
    ]);
    assert.equal((canvas.length - 2) / 2, 4096);
    assert.deepEqual(constants, [64n, 64n, 16n, 4096n, 30n]);
    const receipt = await reader.getTransactionReceipt({ hash: handoff.contracts[0].txHash });
    assert.equal(receipt.status, 'success');
    assert.equal(Number(receipt.blockNumber), handoff.contracts[0].blockNumber);
    // Factory deployment: verify code appears at the attested block and the receipt includes its address and attestation.
    const [before, at] = await Promise.all([
      reader.getCode({ address: contract.address, blockNumber: receipt.blockNumber - 1n }),
      reader.getCode({ address: contract.address, blockNumber: receipt.blockNumber }),
    ]);
    assert(!before || before === '0x');
    assert.equal(at, code);
    assert(receipt.logs.some(log => log.data.toLowerCase().includes(contract.address.slice(2).toLowerCase()) && log.data.includes(config.attestationHash) && log.data.includes(config.sourceCommit)));
    const logs = await reader.getContractEvents({ ...args, eventName: 'Painted', fromBlock: receipt.blockNumber, toBlock: block.number });
    results.push({ url, passed: true, chainId, codeBytes: (code.length - 2) / 2, codeKeccak: keccak256(code),
      block: String(block.number), blockTimestamp: String(block.timestamp), canvasBytes: 4096,
      nonWhitePixels: [...Buffer.from(canvas.slice(2), 'hex')].filter(color => color !== 0).length,
      constants: constants.map(String), deploymentBlockCodeMatches: true, factoryAttestationMatches: true, receiptMatches: true, paintedEvents: logs.length });
  } catch (error) { results.push({ url, passed: false, error: error.shortMessage ?? error.message }); }
}
const evidence = { checkedAt: new Date().toISOString(), readOnly: true, results };
await writeFile(new URL('../../docs/frontend-evidence/live-rpc.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
if (!results.some(result => result.passed)) process.exitCode = 1;
