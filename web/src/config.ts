import { createPublicClient, custom, defineChain, fallback, http, isAddress, type Abi, type Address, type EIP1193Provider } from 'viem';
import { abiHash, safePath } from './integrity.ts';

export type Provider = EIP1193Provider & {
  providers?: Provider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
};

export type Manifest = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[];
  };
  walletAddChain?: {
    chainId: `0x${string}`; chainName: string; rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[];
  };
};

export type Deployment = Awaited<ReturnType<typeof loadDeployment>>;
async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(new URL(path, new URL('.', window.location.href)), { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Could not load ${path}. Reload to try again.`);
  return response.json();
}

export async function loadDeployment() {
  const manifest = await fetchJson('imd-deployment.json') as Manifest;
  if (manifest.version !== 1 || !Number.isSafeInteger(manifest.chainId) || manifest.chainId <= 0
    || manifest.network?.chainId !== manifest.chainId || !manifest.network.rpcUrls?.length
    || !Array.isArray(manifest.contracts) || !Array.isArray(manifest.assets)) throw new Error('Deployment configuration is invalid. Painting is disabled.');
  if (manifest.walletAddChain && Number(manifest.walletAddChain.chainId) !== manifest.chainId) throw new Error('Wallet network configuration does not match the deployment.');
  const abis = await Promise.all(manifest.contracts.map(async contract => {
    if (!isAddress(contract.address) || !safePath(contract.abiPath)) throw new Error('Invalid contract configuration.');
    const abi = await fetchJson(contract.abiPath);
    if (!Array.isArray(abi) || abiHash(abi) !== contract.abiHash) throw new Error('Contract interface verification failed. Painting is disabled.');
    return { ...contract, abi: abi as Abi };
  }));
  const contract = abis.find(x => x.name === 'PixelCommons');
  if (!contract) throw new Error('PixelCommons is missing from this deployment.');
  const chain = defineChain({
    id: manifest.chainId, name: manifest.network.name, testnet: manifest.network.testnet,
    nativeCurrency: manifest.network.nativeCurrency,
    rpcUrls: { default: { http: manifest.network.rpcUrls } },
    blockExplorers: { default: { name: `${manifest.network.name} explorer`, url: manifest.network.explorer } },
  });
  return { manifest, contract, chain };
}

export function makeReader(deployment: Deployment, provider?: Provider) {
  const transports = deployment.manifest.network.rpcUrls.map(url => http(url, { timeout: 8000, retryCount: 0 }));
  const walletFallback = provider ? [custom({
    request: async ({ method, params }) => {
      const chainId = await provider.request({ method: 'eth_chainId' });
      if (Number(chainId) !== deployment.chain.id) throw new Error('Wallet is on the wrong network.');
      return provider.request({ method, params } as Parameters<Provider['request']>[0]);
    },
  }, { retryCount: 0 })] : [];
  return createPublicClient({
    chain: deployment.chain,
    transport: fallback([...transports, ...walletFallback], { rank: false, retryCount: 0 }),
    pollingInterval: 4000,
  });
}

export type Reader = ReturnType<typeof makeReader>;
