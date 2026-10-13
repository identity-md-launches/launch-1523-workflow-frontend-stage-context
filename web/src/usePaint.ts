import { useRef, useState } from 'react';
import { createWalletClient, custom, isAddress, type Address, type Hex } from 'viem';
import type { Deployment, Provider, Reader } from './config.ts';
import { simulatePaint } from './chain.ts';
import { errorMessage, validPixel, type Pixel } from './model.ts';

type PendingPaint = { hash: Hex; account: Address; pixel: Pixel; color: number };
type Phase = 'idle' | 'simulating' | 'signing' | 'pending' | 'unconfirmed' | 'success' | 'error';

export function usePaint(deployment: Deployment, reader: Reader, refresh: () => Promise<void>) {
  const key = `pixelcommons:pending:${deployment.chain.id}:${deployment.contract.address}`;
  const [transaction, setTransaction] = useState<PendingPaint | undefined>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as PendingPaint | null;
      if (saved && /^0x[0-9a-fA-F]{64}$/.test(saved.hash) && isAddress(saved.account) && validPixel(saved.pixel) && Number.isInteger(saved.color) && saved.color >= 0 && saved.color < 16) return saved;
    } catch { /* Storage may be disabled; signing still works. */ }
  });
  const [phase, setPhase] = useState<Phase>(transaction ? 'unconfirmed' : 'idle');
  const [message, setMessage] = useState(transaction ? 'A paint was submitted in this tab. Check its confirmation before painting again.' : '');
  const inFlight = useRef(false);
  const store = (tx?: PendingPaint) => {
    setTransaction(tx);
    try { if (tx) sessionStorage.setItem(key, JSON.stringify(tx)); else sessionStorage.removeItem(key); } catch { /* Best-effort pending recovery. */ }
  };
  const finish = () => { try { sessionStorage.removeItem(key); } catch { /* Storage is optional. */ } };

  async function confirm(tx: PendingPaint) {
    setPhase('pending'); setMessage('Paint submitted. Waiting for a network confirmation.');
    let replaced = false;
    try {
      const receipt = await reader.waitForTransactionReceipt({ hash: tx.hash, confirmations: 1, timeout: 90000,
        onReplaced: replacement => {
          tx = { ...tx, hash: replacement.transactionReceipt.transactionHash }; store(tx);
          if (replacement.reason !== 'repriced') replaced = true;
        },
      });
      finish();
      if (replaced) { setPhase('error'); setMessage('The wallet replaced or cancelled this paint. Refresh the canvas before trying again.'); }
      else if (receipt.status === 'reverted') { setPhase('error'); setMessage('The paint was reverted. Refresh your cooldown and try again. Network gas may still have been spent.'); }
      else {
        setPhase('success'); setMessage(`Paint confirmed at (${tx.pixel.x}, ${tx.pixel.y}). The canvas will refresh from the chain.`);
      }
      await refresh();
    } catch {
      setPhase('unconfirmed'); setMessage('Confirmation is taking longer than expected. Your paint may still confirm. Check its status before submitting another.');
    }
  }

  async function paint(provider: Provider, account: Address, pixel: Pixel, color: number) {
    if (inFlight.current || ['pending', 'unconfirmed'].includes(phase)) return;
    inFlight.current = true; setPhase('simulating'); setMessage('Checking your paint and cooldown…'); store(undefined);
    try {
      const { request } = await simulatePaint(reader, deployment, account, pixel, color);
      // Recheck the provider immediately before signing: a wallet may change during simulation.
      const [accounts, chain] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]);
      if (Number(chain) !== deployment.chain.id || accounts[0]?.toLowerCase() !== account.toLowerCase()) throw new Error('Wallet account or chain changed.');
      setPhase('signing'); setMessage(`Confirm the paint at (${pixel.x}, ${pixel.y}) in your wallet. Only network gas is charged.`);
      const wallet = createWalletClient({ account, chain: deployment.chain, transport: custom(provider) });
      const hash = await wallet.writeContract(request);
      const tx = { hash, account, pixel, color }; store(tx);
      await confirm(tx);
    } catch (error) { setPhase('error'); setMessage(errorMessage(error)); await refresh(); }
    finally { inFlight.current = false; }
  }
  async function recheck() {
    if (!transaction || inFlight.current) return;
    inFlight.current = true;
    try { await confirm(transaction); } finally { inFlight.current = false; }
  }
  return { transaction, phase, message, paint, recheck,
    busy: ['simulating', 'signing', 'pending', 'unconfirmed'].includes(phase) };
}
