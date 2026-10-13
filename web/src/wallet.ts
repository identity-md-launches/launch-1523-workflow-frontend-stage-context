import { useCallback, useEffect, useRef, useState } from 'react';
import { getAddress, isAddress, type Address } from 'viem';
import type { Deployment, Provider } from './config.ts';
import { errorMessage, isUnknownChain } from './model.ts';

type WalletOption = { id: string; name: string; provider: Provider };
declare global { interface Window { ethereum?: Provider } }

export function useWallet(deployment: Deployment) {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [provider, setProvider] = useState<Provider>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chooser, setChooser] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<{ info: { uuid: string; name: string }; provider: Provider }>).detail;
      if (!detail?.provider?.request || !detail.info?.uuid) return;
      setOptions(current => [...current.filter(item => item.provider !== detail.provider && item.id !== detail.info.uuid),
        { id: detail.info.uuid, name: detail.info.name.slice(0, 80), provider: detail.provider }]);
    };
    const legacy = () => {
      const injected = window.ethereum?.providers ?? (window.ethereum ? [window.ethereum] : []);
      setOptions(current => [...current, ...injected.filter(p => !current.some(item => item.provider === p)).map((p, i) => ({
        id: `injected-${i}`, name: p.isMetaMask ? 'MetaMask' : p.isCoinbaseWallet ? 'Coinbase Wallet' : 'Browser wallet', provider: p,
      }))]);
    };
    window.addEventListener('eip6963:announceProvider', announce);
    legacy();
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    window.addEventListener('ethereum#initialized', legacy);
    return () => { window.removeEventListener('eip6963:announceProvider', announce); window.removeEventListener('ethereum#initialized', legacy); };
  }, []);

  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (accounts: string[]) => { setAccount(accounts[0] && isAddress(accounts[0]) ? getAddress(accounts[0]) : undefined); setError(''); };
    const chainChanged = (value: string) => { setChainId(Number(value)); setError(''); };
    const disconnected = () => { setAccount(undefined); setChainId(undefined); setProvider(undefined); };
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('chainChanged', chainChanged);
    provider.on?.('disconnect', disconnected);
    return () => { provider.removeListener?.('accountsChanged', accountsChanged); provider.removeListener?.('chainChanged', chainChanged); provider.removeListener?.('disconnect', disconnected); };
  }, [provider]);

  const connect = useCallback(async (chosen?: WalletOption) => {
    if (inFlight.current) return;
    const option = chosen ?? (options.length === 1 ? options[0] : undefined);
    if (!option) { setChooser(true); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const accounts = await option.provider.request({ method: 'eth_requestAccounts' });
      const chain = await option.provider.request({ method: 'eth_chainId' });
      if (!accounts[0] || !isAddress(accounts[0])) throw new Error('No wallet account was returned.');
      setProvider(option.provider); setAccount(getAddress(accounts[0])); setChainId(Number(chain)); setChooser(false);
    } catch (error) { setError(errorMessage(error)); }
    finally { inFlight.current = false; setBusy(false); }
  }, [options]);

  const switchChain = async () => {
    if (!provider || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const target = `0x${deployment.chain.id.toString(16)}` as `0x${string}`;
    try {
      try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target }] }); }
      catch (error) {
        if (!isUnknownChain(error) || !deployment.manifest.walletAddChain) throw error;
        await provider.request({ method: 'wallet_addEthereumChain', params: [deployment.manifest.walletAddChain] });
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target }] });
      }
      setChainId(Number(await provider.request({ method: 'eth_chainId' })));
    } catch (error) { setError(errorMessage(error)); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return { options, provider, account, chainId, busy, error, chooser, setChooser, connect, switchChain,
    disconnect: () => { setProvider(undefined); setAccount(undefined); setChainId(undefined); setError(''); },
    correctChain: chainId === deployment.chain.id };
}
