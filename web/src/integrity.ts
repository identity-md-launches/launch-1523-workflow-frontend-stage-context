import { keccak256, toBytes } from 'viem';

/** Object keys sorted recursively; array order is part of the ABI. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const abiHash = (abi: unknown) => keccak256(toBytes(canonical(abi))).slice(2);
export const safePath = (path: string) => typeof path === 'string' && /^[a-zA-Z0-9_./-]+$/.test(path)
  && !path.startsWith('/') && !path.split('/').some(part => part === '..' || part === '.' || part === '');
