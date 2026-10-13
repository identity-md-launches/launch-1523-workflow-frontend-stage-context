import { BaseError, ContractFunctionRevertedError, hexToBytes } from 'viem';

export const PALETTE = [
  { name: 'White', hex: '#ffffff' }, { name: 'Silver', hex: '#b8bfc5' },
  { name: 'Slate', hex: '#5c6773' }, { name: 'Black', hex: '#20252b' },
  { name: 'Rose', hex: '#f5a9b8' }, { name: 'Red', hex: '#d83142' },
  { name: 'Orange', hex: '#ed793b' }, { name: 'Yellow', hex: '#f7d76a' },
  { name: 'Lime', hex: '#b4d96c' }, { name: 'Green', hex: '#328559' },
  { name: 'Teal', hex: '#279b9c' }, { name: 'Sky', hex: '#88c5ed' },
  { name: 'Blue', hex: '#3765cb' }, { name: 'Purple', hex: '#8957b4' },
  { name: 'Pink', hex: '#d267a3' }, { name: 'Brown', hex: '#825742' },
] as const;

export type Pixel = { x: number; y: number };
export function validPixel(pixel: Pixel) {
  return Number.isInteger(pixel.x) && Number.isInteger(pixel.y) && pixel.x >= 0 && pixel.x < 64 && pixel.y >= 0 && pixel.y < 64;
}
export function decodeCanvas(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{8192}$/.test(value)) throw new Error('The canvas response was invalid.');
  const pixels = hexToBytes(value as `0x${string}`);
  if (pixels.some(color => color > 15)) throw new Error('The canvas contains an unknown color.');
  return pixels;
}
export function errorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      if (reverted.data?.errorName === 'CooldownActive') return 'Your wallet is still cooling down. Wait for the countdown, then try again.';
      if (reverted.data?.errorName === 'InvalidCoordinates') return 'Choose coordinates from 0 to 63, then try again.';
      if (reverted.data?.errorName === 'InvalidColor') return 'Choose one of the 16 palette colors, then try again.';
    }
  }
  const texts: string[] = [];
  let current = error as { message?: string; code?: number; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 8; depth++) {
    if (current.code === 4001) return 'Request declined in your wallet. You can try again when you’re ready.';
    if (current.code === -32002) return 'A request is already open in your wallet. Open it to continue.';
    if (current.message) texts.push(current.message);
    current = current.cause as typeof current;
  }
  const text = texts.join(' ');
  if (/rejected|denied/i.test(text)) return 'Request declined in your wallet. You can try again when you’re ready.';
  if (/insufficient funds/i.test(text)) return 'You need Sepolia test ETH for network gas. Use a faucet below, then try again.';
  if (/cooldown/i.test(text)) return 'Your wallet is still cooling down. Wait for the countdown, then try again.';
  if (/account or chain changed/i.test(text)) return 'Your wallet account or network changed. Check the connected wallet, then try again.';
  if (/chain|network mismatch/i.test(text)) return 'Your wallet network changed. Switch back to the canvas network and try again.';
  if (/reverted/i.test(text)) return 'The paint was reverted. Refresh the canvas and your cooldown before trying again.';
  return 'Could not complete the request. Check your connection and wallet, then try again.';
}

export function isUnknownChain(error: unknown): boolean {
  let current = error as { code?: number; message?: string; cause?: unknown; data?: { originalError?: unknown } } | undefined;
  for (let i = 0; current && i < 8; i++) {
    if (current.code === 4902 || /unknown chain|unrecognized chain|chain.*not (added|configured|found)|not.*added.*chain/i.test(current.message ?? '')) return true;
    current = (current.cause ?? current.data?.originalError) as typeof current;
  }
  return false;
}
