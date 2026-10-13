import { decodeEventLog, type Address, type Hex } from 'viem';
import type { Deployment, Reader } from './config.ts';
import { decodeCanvas, validPixel, type Pixel } from './model.ts';

export async function verifyContract(reader: Reader, deployment: Deployment) {
  if (await reader.getChainId() !== deployment.chain.id) throw new Error('RPC network verification failed.');
  const code = await reader.getCode({ address: deployment.contract.address });
  if (!code || code === '0x') throw new Error('Deployed contract code was not found.');
  const constants = await Promise.all(['WIDTH', 'HEIGHT', 'COLOR_COUNT', 'PIXEL_COUNT', 'COOLDOWN'].map(functionName =>
    reader.readContract({ ...deployment.contract, functionName })));
  if (constants.some((value, i) => value !== [64n, 64n, 16n, 4096n, 30n][i])) throw new Error('Contract canvas settings do not match this interface.');
}

export async function readCanvas(reader: Reader, deployment: Deployment, account?: Address) {
  const block = await reader.getBlock({ blockTag: 'latest' });
  const [raw, nextPaintAt, balance] = await Promise.all([
    reader.readContract({ ...deployment.contract, functionName: 'getCanvas', blockNumber: block.number }),
    account ? reader.readContract({ ...deployment.contract, functionName: 'nextPaintAt', args: [account], blockNumber: block.number }) : Promise.resolve(undefined),
    account ? reader.getBalance({ address: account, blockNumber: block.number }) : Promise.resolve(undefined),
  ]);
  return { pixels: decodeCanvas(raw), nextPaintAt: nextPaintAt as bigint | undefined, balance, block: block.number,
    chainTime: Number(block.timestamp), fetchedAt: Date.now(), account };
}

export async function simulatePaint(reader: Reader, deployment: Deployment, account: Address, pixel: Pixel, color: number) {
  if (!validPixel(pixel) || !Number.isInteger(color) || color < 0 || color > 15) throw new Error('Invalid paint selection.');
  await verifyContract(reader, deployment);
  return reader.simulateContract({ ...deployment.contract, functionName: 'paint', args: [BigInt(pixel.x), BigInt(pixel.y), BigInt(color)], account });
}

export type PaintEvent = { id: string; painter: Address; x: number; y: number; color: number; block: bigint; logIndex: number; hash: Hex };

/** Scan backwards progressively, one bounded window per refresh. No invented events or fixed deployment-block map. */
export class PaintFeed {
  events: PaintEvent[] = [];
  complete = false;
  private olderCursor?: bigint;
  private newest?: bigint;
  private birthReached = false;
  private window = 2000n;
  private reader: Reader;
  private deployment: Deployment;
  constructor(reader: Reader, deployment: Deployment) { this.reader = reader; this.deployment = deployment; }

  private async logs(from: bigint, to: bigint): Promise<PaintEvent[]> {
    try {
      const raw = await this.reader.getContractEvents({ ...this.deployment.contract, eventName: 'Painted', fromBlock: from, toBlock: to, strict: true });
      return raw.filter(log => !log.removed && log.blockNumber !== null && log.transactionHash !== null).map(log => {
        const decoded = decodeEventLog({ abi: this.deployment.contract.abi, data: log.data, topics: log.topics });
        const args = decoded.args as unknown as { painter: Address; x: bigint; y: bigint; color: bigint };
        return { id: `${log.blockHash}:${log.logIndex}`, painter: args.painter, x: Number(args.x), y: Number(args.y), color: Number(args.color), block: log.blockNumber!, logIndex: log.logIndex!, hash: log.transactionHash! };
      });
    } catch (error) {
      // Some public providers restrict log ranges. Split rather than silently dropping history.
      if (to - from > 250n && /range|limit|too many|maximum.*block/i.test(error instanceof Error ? error.message : '')) {
        const middle = (from + to) / 2n;
        const left = await this.logs(from, middle);
        return [...left, ...await this.logs(middle + 1n, to)];
      }
      throw error;
    }
  }

  async refresh(head: bigint) {
    const from = this.newest === undefined ? (head > this.window ? head - this.window : 0n) :
      (this.newest > 12n ? this.newest - 12n : 0n);
    const start = from > head ? (head > 12n ? head - 12n : 0n) : from;
    const latest = await this.logs(start, head);
    // Replace the overlap to remove logs orphaned by shallow reorganizations.
    this.events = this.events.filter(event => event.block < start);
    this.merge(latest);
    this.newest = head;
    if (this.olderCursor === undefined) this.olderCursor = start;
    this.complete = this.events.length >= 20 || this.birthReached;
    if (!this.complete) {
      const cursor = this.olderCursor;
      const code = cursor > 0n ? await this.reader.getCode({ address: this.deployment.contract.address, blockNumber: cursor - 1n }) : undefined;
      if (!code || code === '0x' || cursor === 0n) { this.birthReached = true; this.complete = true; }
      else {
        const low = cursor > this.window ? cursor - this.window : 0n;
        const older = await this.logs(low, cursor - 1n);
        this.merge(older);
        this.olderCursor = low;
        this.birthReached = low === 0n;
        this.complete = this.events.length >= 20 || this.birthReached;
      }
    }
    return { events: [...this.events], complete: this.complete };
  }

  private merge(events: PaintEvent[]) {
    this.events = [...new Map([...this.events, ...events].map(event => [event.id, event])).values()]
      .sort((a, b) => a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1).slice(0, 20);
  }
}
