import { chromium, webkit } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, encodeEventTopics, encodeAbiParameters, toHex } from 'viem';
import { preview } from '../scripts/serve.mjs';

const config = JSON.parse(await readFile(new URL('../../dist/imd-deployment.json', import.meta.url), 'utf8'));
const contract = config.contracts[0];
const abi = JSON.parse(await readFile(new URL(`../../dist/${contract.abiPath}`, import.meta.url), 'utf8'));
const evidence = fileURLToPath(new URL('../../docs/frontend-evidence/', import.meta.url));
await mkdir(evidence, { recursive: true });
const server = preview();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [];
const account = `0x${'a1'.repeat(20)}`;
const otherAccount = `0x${'c3'.repeat(20)}`;
const txHash = `0x${'b2'.repeat(32)}`;
const blockHash = `0x${'d4'.repeat(32)}`;
const emptyHash = `0x${'00'.repeat(32)}`;
const bloom = `0x${'00'.repeat(256)}`;

function mockState() {
  return { pixels: new Uint8Array(4096), now: Math.floor(Date.now() / 1000), block: 3000n, nextAt: 0n,
    ready: false, rejectSimulation: false, failRpc: false, missingCode: false, receiptStatus: '0x1',
    sendCount: 0, calls: [], unexpected: [], events: [], tx: null, receipt: null, delayMs: 0 };
}
function rawBlock(state) {
  return { number: toHex(state.block), hash: blockHash, parentHash: emptyHash, nonce: '0x0000000000000000', sha3Uncles: emptyHash,
    logsBloom: bloom, transactionsRoot: emptyHash, stateRoot: emptyHash, receiptsRoot: emptyHash, miner: account,
    difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x100', gasLimit: '0x1c9c380',
    gasUsed: '0x10000', timestamp: toHex(state.now), transactions: [], uncles: [], baseFeePerGas: '0x3b9aca00' };
}
function paintLog(index, hash = txHash) {
  return { address: contract.address, blockHash, blockNumber: '0xbb8', transactionHash: hash,
    transactionIndex: '0x0', logIndex: toHex(index), removed: false,
    topics: encodeEventTopics({ abi, eventName: 'Painted', args: { painter: account, x: BigInt(index % 64), y: 3n } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(index % 16)]) };
}
function rpc(state, request) {
  state.calls.push(request);
  if (state.failRpc) return { error: { code: -32603, message: 'Test RPC unavailable' } };
  const params = request.params ?? [];
  let result;
  switch (request.method) {
    case 'eth_chainId': result = toHex(config.chainId); break;
    case 'eth_blockNumber': result = toHex(state.block); break;
    case 'eth_getCode': result = state.missingCode || (params[1] !== 'latest' && BigInt(params[1]) < 2000n) ? '0x' : '0x600060005260206000f3'; break;
    case 'eth_getBlockByNumber': result = rawBlock(state); break;
    case 'eth_getBalance': result = '0x33b2e3c9fd0803ce8000000'; break;
    case 'eth_gasPrice': result = '0x3b9aca00'; break;
    case 'eth_estimateGas': result = '0x186a0'; break;
    case 'eth_getTransactionCount': result = '0x1'; break;
    case 'eth_getLogs': {
      const { fromBlock, toBlock } = params[0];
      result = state.events.filter(event => BigInt(event.blockNumber) >= BigInt(fromBlock) && BigInt(event.blockNumber) <= BigInt(toBlock)); break;
    }
    case 'eth_call': {
      const { functionName, args } = decodeFunctionData({ abi, data: params[0].data });
      if (functionName === 'paint') {
        if (state.rejectSimulation || state.nextAt > BigInt(state.now)) return { error: { code: 3, message: 'execution reverted', data: encodeErrorResult({ abi, errorName: 'CooldownActive', args: [state.nextAt || BigInt(state.now + 30)] }) } };
        result = '0x'; break;
      }
      const values = { WIDTH: 64n, HEIGHT: 64n, COLOR_COUNT: 16n, PIXEL_COUNT: 4096n, COOLDOWN: 30n,
        getCanvas: `0x${Buffer.from(state.pixels).toString('hex')}`, nextPaintAt: args?.[0]?.toLowerCase() === otherAccount.toLowerCase() ? 0n : state.nextAt };
      result = encodeFunctionResult({ abi, functionName, result: values[functionName] }); break;
    }
    case 'eth_getTransactionByHash': result = state.tx ? { ...state.tx, hash: txHash, blockHash: state.ready ? blockHash : null,
      blockNumber: state.ready ? toHex(state.block) : null, transactionIndex: state.ready ? '0x0' : null,
      nonce: '0x0', value: '0x0', gas: '0x186a0', gasPrice: '0x3b9aca00', input: state.tx.data,
      v: '0x1b', r: emptyHash, s: emptyHash, type: '0x0' } : null; break;
    case 'eth_getTransactionReceipt': {
      if (!state.ready) { result = null; break; }
      if (!state.receipt) {
        if (state.receiptStatus === '0x1' && state.tx) {
          const { args } = decodeFunctionData({ abi, data: state.tx.data });
          state.pixels[Number(args[1]) * 64 + Number(args[0])] = Number(args[2]);
          state.nextAt = BigInt(state.now + 30);
          const event = paintLog(0);
          event.topics = encodeEventTopics({ abi, eventName: 'Painted', args: { painter: account, x: args[0], y: args[1] } });
          event.data = encodeAbiParameters([{ type: 'uint256' }], [args[2]]);
          state.events = [event];
        }
        state.receipt = { transactionHash: txHash, transactionIndex: '0x0', blockHash, blockNumber: toHex(state.block),
          from: account, to: contract.address, cumulativeGasUsed: '0x186a0', gasUsed: '0x186a0', contractAddress: null,
          logs: state.events, logsBloom: bloom, status: state.receiptStatus, effectiveGasPrice: '0x3b9aca00', type: '0x0' };
      }
      result = state.receipt; break;
    }
    default: state.unexpected.push(request.method); return { error: { code: -32601, message: `Unsupported mock RPC ${request.method}` } };
  }
  return { result };
}
async function fixture(browser, { wallet = true, chainId = config.chainId, width = 390, state = mockState(), corruptAbi = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const consoleErrors = [], resourceErrors = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) resourceErrors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/*', async route => {
    const request = route.request();
    if (config.network.rpcUrls.some(rpcUrl => request.url().startsWith(rpcUrl))) {
      if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs));
      let body = JSON.parse(request.postData());
      const execute = query => ({ jsonrpc: '2.0', id: query.id, ...rpc(state, query) });
      body = Array.isArray(body) ? body.map(execute) : execute(body);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } });
    } else if (request.url().startsWith(url)) {
      if (corruptAbi && request.url().endsWith(contract.abiPath)) await route.fulfill({ contentType: 'application/json', body: '[]' });
      else await route.continue();
    } else await route.abort();
  });
  if (wallet) {
    await page.exposeFunction('testOnSend', async tx => { state.sendCount++; state.tx = tx; return txHash; });
    await page.addInitScript(({ account, chainId, chainHex }) => {
      const listeners = {};
      window.testWallet = { account, chain: `0x${chainId.toString(16)}`, mode: 'normal', unknown: false, calls: [],
        emit(name, value) { for (const listener of listeners[name] ?? []) listener(value); } };
      window.ethereum = {
        isMetaMask: true,
        on(name, fn) { (listeners[name] ??= []).push(fn); },
        removeListener(name, fn) { listeners[name] = (listeners[name] ?? []).filter(value => value !== fn); },
        async request({ method, params }) {
          const wallet = window.testWallet; wallet.calls.push({ method, params });
          if (method === 'eth_requestAccounts') { if (wallet.mode === 'reject-connect') throw { code: 4001 }; return [wallet.account]; }
          if (method === 'eth_accounts') return [wallet.account];
          if (method === 'eth_chainId') return wallet.chain;
          if (method === 'wallet_switchEthereumChain') {
            if (wallet.mode === 'reject-switch') throw { code: 4001 };
            if (wallet.unknown) throw { code: 4902 };
            wallet.chain = params[0].chainId; wallet.emit('chainChanged', wallet.chain); return null;
          }
          if (method === 'wallet_addEthereumChain') { wallet.unknown = false; wallet.added = params[0]; return null; }
          if (method === 'eth_sendTransaction') {
            if (wallet.mode === 'reject-sign') throw { code: 4001 };
            if (wallet.chain !== chainHex) throw { code: -32603, message: 'wrong chain' };
            return window.testOnSend(params[0]);
          }
          throw { code: -32601, message: `Unsupported mock wallet ${method}` };
        },
      };
    }, { account, chainId, chainHex: toHex(config.chainId) });
  }
  await page.goto(url);
  return { page, context, state, consoleErrors, resourceErrors,
    async close() { assert.deepEqual(consoleErrors, []); assert.deepEqual(resourceErrors, []); assert.deepEqual(state.unexpected, []); await context.close(); } };
}
async function visible(page, text) { await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 }); }
async function ready(page) { await visible(page, 'Canvas live'); }
async function connect(page) { await page.getByRole('button', { name: 'Connect wallet', exact: true }).click(); await visible(page, 'Wallet connected'); }
async function select(page, x = 7, y = 9) {
  await page.getByText('Choose exact coordinates', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Column' }).fill(String(x));
  await page.getByRole('spinbutton', { name: 'Row' }).fill(String(y));
  await page.getByRole('button', { name: 'Select pixel', exact: true }).click();
  await page.getByText('Choose exact coordinates', { exact: true }).click();
}
async function check(name, fn) {
  const start = Date.now();
  try { await fn(); results.push({ name, passed: true, durationMs: Date.now() - start }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message, durationMs: Date.now() - start }); console.error(`FAIL ${name}: ${error.stack}`); }
}

try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    let browser;
    try { browser = await engine.launch({ headless: true, ...(name === 'webkit' && process.env.PIXELCOMMONS_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXELCOMMONS_WEBKIT_EXECUTABLE } : {}) }); }
    catch (error) { results.push({ name: `${name} availability`, passed: false, limitation: error.message }); continue; }
    await check(`${name}: viewing, mobile first screen, keyboard selection, wallet, paint confirmation and cooldown`, async () => {
      const f = await fixture(browser); const { page, state } = f;
      try {
        await ready(page);
        assert.equal(await page.locator('.swatch').count(), 16);
        assert.equal(await page.locator('.activity-list li').count(), 0);
        const bounds = await page.locator('.paint-action').boundingBox();
        assert(bounds.y + bounds.height <= 844, `Primary action bottom ${bounds.y + bounds.height} exceeds first screen`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: `${evidence}/${name}-390-disconnected.png`, fullPage: true });
        await connect(page);
        const canvas = page.getByRole('button', { name: /^Canvas, pixel/ });
        await canvas.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Paint pixel (32, 32)', exact: true }).waitFor();
        await select(page);
        await page.getByRole('button', { name: 'Blue, color 12', exact: true }).click();
        const paintButton = page.getByRole('button', { name: 'Paint pixel (7, 9)', exact: true });
        await paintButton.click();
        await visible(page, 'Paint submitted. Waiting for a network confirmation.');
        assert.equal(await page.locator('.paint-action').isDisabled(), true);
        assert.equal(state.sendCount, 1);
        const decoded = decodeFunctionData({ abi, data: state.tx.data });
        assert.equal(decoded.functionName, 'paint'); assert.deepEqual(decoded.args, [7n, 9n, 12n]);
        assert.equal(state.tx.to.toLowerCase(), contract.address.toLowerCase()); assert(!state.tx.value || BigInt(state.tx.value) === 0n);
        assert(state.calls.some(x => x.method === 'eth_call' && decodeFunctionData({ abi, data: x.params[0].data }).functionName === 'paint'));
        state.ready = true; state.block++; state.now++;
        await visible(page, 'Paint confirmed at (7, 9). The canvas will refresh from the chain.');
        await page.getByRole('button', { name: /Next paint in/ }).waitFor();
        assert.equal(state.pixels[9 * 64 + 7], 12);
        await page.locator('.activity-list li').first().waitFor();
        await page.screenshot({ path: `${evidence}/${name}-390-confirmed-mock.png`, fullPage: true });
        state.now += 31; state.block++;
        await page.getByRole('button', { name: 'Refresh canvas', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('.paint-action').disabled);
        await f.close();
      } catch (error) { await page.screenshot({ path: `${evidence}/${name}-failure.png`, fullPage: true }); await f.context.close(); throw error; }
    });
    if (name === 'chromium') {
      await check('missing wallet opens accessible explanation and Escape restores focus', async () => {
        const f = await fixture(browser, { wallet: false }); await ready(f.page);
        await f.page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
        await visible(f.page, 'No browser wallet found.');
        assert.equal(await f.page.getByRole('dialog').count(), 1);
        await f.page.keyboard.press('Escape');
        assert.equal(await f.page.getByRole('button', { name: 'Connect wallet', exact: true }).evaluate(el => el === document.activeElement), true);
        await f.close();
      });
      await check('unknown chain adds exact handoff network then switches; rejected switch is recoverable', async () => {
        const f = await fixture(browser, { chainId: 1 }); await ready(f.page); await connect(f.page);
        await f.page.evaluate(() => { window.testWallet.mode = 'reject-switch'; });
        await f.page.getByRole('button', { name: `Switch to ${config.network.name}`, exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Request declined' }).waitFor();
        await f.page.evaluate(() => { window.testWallet.mode = 'normal'; window.testWallet.unknown = true; });
        await f.page.getByRole('button', { name: `Switch to ${config.network.name}`, exact: true }).click();
        await f.page.getByRole('button', { name: 'Select a pixel to paint', exact: true }).waitFor();
        assert.deepEqual(await f.page.evaluate(() => window.testWallet.added), config.walletAddChain);
        const methods = await f.page.evaluate(() => window.testWallet.calls.map(x => x.method));
        assert(methods.indexOf('wallet_addEthereumChain') > methods.indexOf('wallet_switchEthereumChain'));
        assert.equal(f.state.sendCount, 0); await f.close();
      });
      await check('wallet rejection, simulation revert and changed account never report success or send unexpectedly', async () => {
        const f = await fixture(browser); await ready(f.page);
        await f.page.evaluate(() => { window.testWallet.mode = 'reject-connect'; });
        await f.page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Request declined' }).waitFor();
        await f.page.evaluate(() => { window.testWallet.mode = 'normal'; }); await connect(f.page); await select(f.page, 0, 63);
        f.state.rejectSimulation = true;
        await f.page.getByRole('button', { name: 'Paint pixel (0, 63)' }).click();
        await visible(f.page, 'Your wallet is still cooling down. Wait for the countdown, then try again.');
        assert.equal(f.state.sendCount, 0);
        f.state.rejectSimulation = false;
        await f.page.evaluate(() => { window.testWallet.mode = 'reject-sign'; });
        await f.page.getByRole('button', { name: 'Paint pixel (0, 63)' }).click();
        await visible(f.page, 'Request declined in your wallet. You can try again when you’re ready.');
        assert.equal(f.state.sendCount, 0);
        await f.page.evaluate(other => { window.testWallet.account = other; window.testWallet.emit('accountsChanged', [other]); }, otherAccount);
        await f.page.waitForFunction(() => !document.querySelector('.paint-action').disabled);
        await f.page.getByText('Connected account', { exact: true }).click();
        assert.match((await f.page.locator('.wallet-details').innerText()).toLowerCase(), new RegExp(otherAccount));
        await f.close();
      });
      await check('RPC outage and missing code disable paint; retry restores read state', async () => {
        const state = mockState(); state.failRpc = true;
        const f = await fixture(browser, { state });
        await f.page.getByRole('button', { name: 'Retry connection', exact: true }).waitFor({ timeout: 30000 });
        state.failRpc = false; await f.page.getByRole('button', { name: 'Retry connection', exact: true }).click(); await ready(f.page);
        await connect(f.page); await select(f.page);
        state.failRpc = true; await f.page.getByRole('button', { name: 'Refresh canvas', exact: true }).click();
        await f.page.getByRole('button', { name: 'Retry connection', exact: true }).waitFor({ timeout: 30000 });
        assert.equal(await f.page.locator('.paint-action').isDisabled(), true); state.failRpc = false;
        await f.page.getByRole('button', { name: 'Retry connection', exact: true }).click(); await ready(f.page);
        assert.equal(state.sendCount, 0); await f.close();
        const bad = mockState(); bad.missingCode = true; const g = await fixture(browser, { state: bad });
        await g.page.getByRole('button', { name: 'Retry connection', exact: true }).waitFor({ timeout: 30000 });
        assert.equal(await g.page.getByText('Canvas live', { exact: true }).count(), 0); await g.close();
      });
      await check('ABI tampering fails closed before any RPC or wallet request', async () => {
        const f = await fixture(browser, { corruptAbi: true });
        await visible(f.page, 'Contract interface verification failed. Painting is disabled.');
        assert.equal(f.state.calls.length, 0); assert.equal(await f.page.evaluate(() => window.testWallet.calls.length), 0); await f.close();
      });
      await check('latest 20 events, long balances and full addresses reflow at 320, 390, 768, 1440 and enlarged text', async () => {
        const state = mockState(); state.events = Array.from({ length: 25 }, (_, i) => paintLog(i));
        const f = await fixture(browser, { state, width: 1440 }); await ready(f.page); await connect(f.page);
        await f.page.locator('.activity-list li').nth(19).waitFor();
        assert.equal(await f.page.locator('.activity-list li').count(), 20);
        assert.match(await f.page.locator('.activity-list li').first().innerText(), /\(24, 3\)/);
        await f.page.getByText('Connected account', { exact: true }).click();
        for (const width of [320, 390, 768, 1440]) {
          await f.page.setViewportSize({ width, height: 900 });
          assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`);
        }
        await f.page.screenshot({ path: `${evidence}/chromium-1440-activity-mock.png`, fullPage: true });
        await f.page.setViewportSize({ width: 390, height: 844 });
        await f.page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        const overflow = await f.page.evaluate(() => [...document.querySelectorAll('body *')].map(e => ({ tag: e.tagName, className: e.className, right: e.getBoundingClientRect().right })).filter(e => e.right > innerWidth + 1));
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at 200% text: ${JSON.stringify(overflow)}`);
        await f.close();
      });
      await check('submitted transaction survives reload and reverted receipts remain failures', async () => {
        const f = await fixture(browser); await ready(f.page); await connect(f.page); await select(f.page);
        await f.page.getByRole('button', { name: 'Paint pixel (7, 9)' }).click();
        await visible(f.page, 'Paint submitted. Waiting for a network confirmation.');
        await f.page.reload(); await ready(f.page); await connect(f.page);
        await f.page.getByRole('button', { name: 'Check confirmation', exact: true }).waitFor();
        assert.equal(await f.page.locator('.paint-action').isDisabled(), true);
        f.state.receiptStatus = '0x0'; f.state.ready = true;
        await f.page.getByRole('button', { name: 'Check confirmation', exact: true }).click();
        await visible(f.page, 'The paint was reverted. Refresh your cooldown and try again. Network gas may still have been spent.');
        assert.equal(f.state.sendCount, 1); assert.equal(f.state.pixels[9 * 64 + 7], 0); await f.close();
      });
    }
    await browser.close();
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  await writeFile(`${evidence}/browser-results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'Mock RPC and EIP-1193 wallet. No live transactions.', servedAtGatewaySubpath: true, results }, null, 2) + '\n');
}
if (results.some(result => !result.passed)) process.exitCode = 1;
