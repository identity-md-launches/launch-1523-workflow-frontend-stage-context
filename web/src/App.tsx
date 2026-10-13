import { useEffect, useRef, useState } from 'react';
import { formatEther, getAddress, type Address } from 'viem';
import { loadDeployment, type Deployment } from './config.ts';
import { PALETTE, validPixel, type Pixel } from './model.ts';
import { useWallet } from './wallet.ts';
import { useCanvas } from './useCanvas.ts';
import { usePaint } from './usePaint.ts';
import { CanvasBoard, CoordinatePicker } from './CanvasBoard.tsx';

function Mark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>; }

function AddressLink({ address, explorer }: { address: Address; explorer: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return <span className="address-group"><a className="address" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">{getAddress(address)}</a>
    <button type="button" className="copy-button" aria-label={`Copy address ${getAddress(address)}`} onClick={async () => {
      try { await navigator.clipboard.writeText(getAddress(address)); setCopied(true); setError(''); }
      catch { setError('Select the address to copy it manually.'); }
    }}>{copied ? 'Copied' : 'Copy'}</button><span className="sr-only" role="status">{copied ? 'Address copied' : error}</span>{error && <span className="small">{error}</span>}</span>;
}

function Dialog({ title, open, close, children }: { title: string; open: boolean; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return <dialog ref={ref} className="wallet-dialog" aria-label={title} onCancel={close} onClose={close}>
    <div className="dialog-heading"><h2>{title}</h2><button type="button" className="secondary" onClick={close}>Close</button></div>{children}
  </dialog>;
}

export function App() {
  const [deployment, setDeployment] = useState<Deployment>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false; setError('');
    loadDeployment().then(value => { if (!cancelled) setDeployment(value); }).catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : 'Could not load the deployment.');
    });
    return () => { cancelled = true; };
  }, [attempt]);
  if (deployment) return <Commons deployment={deployment} />;
  return <div className="app"><header className="site-header"><a className="brand" href="./"><Mark />PixelCommons</a></header>
    <main className="startup"><h1>A shared canvas.</h1><p role={error ? 'alert' : 'status'}>{error || 'Loading the canvas configuration…'}</p>
      {error && <button className="primary" type="button" onClick={() => setAttempt(x => x + 1)}>Retry loading</button>}</main></div>;
}

function Commons({ deployment }: { deployment: Deployment }) {
  const wallet = useWallet(deployment);
  const live = useCanvas(deployment, wallet.account, wallet.provider);
  const tx = usePaint(deployment, live.reader, live.refresh);
  const [selected, setSelected] = useState<Pixel>();
  const [color, setColor] = useState(6);
  const [accountOpen, setAccountOpen] = useState(false);
  const { network } = deployment.manifest;
  const current = selected && live.snapshot ? PALETTE[live.snapshot.pixels[selected.y * 64 + selected.x]] : undefined;
  const select = (pixel: Pixel) => { if (validPixel(pixel)) setSelected(pixel); };
  const label = !wallet.account ? 'Connect to paint' : !wallet.correctChain ? `Switch to ${network.name}` :
    tx.phase === 'simulating' ? 'Checking paint…' : tx.phase === 'signing' ? 'Confirm in wallet…' : tx.busy ? 'Paint pending…' :
    !live.fresh ? 'Waiting for live canvas…' : !live.accountReady ? 'Checking cooldown…' :
    !live.eligible ? live.remaining > 0 ? `Next paint in ${live.remaining}s` : 'Waiting for the next block…' :
    !selected ? 'Select a pixel to paint' : `Paint pixel (${selected.x}, ${selected.y})`;
  const actionDisabled = wallet.busy || (!!wallet.account && wallet.correctChain &&
    (tx.busy || !live.fresh || !live.accountReady || !live.eligible || !selected));
  async function primaryAction() {
    if (!wallet.account) return wallet.connect();
    if (!wallet.correctChain) return wallet.switchChain();
    if (wallet.provider && selected && !actionDisabled) await tx.paint(wallet.provider, wallet.account, selected, color);
  }
  return <div className="app">
    <a className="skip-link" href="#paint-controls">Skip to paint controls</a>
    <header className="site-header">
      <a className="brand" href="./" aria-label="PixelCommons home"><Mark /><span>PixelCommons</span></a>
      <div className="header-utilities"><span className="network-label">{network.name} <span>testnet</span></span>
        <button className="secondary wallet-button" type="button" disabled={wallet.busy} onClick={() => wallet.account ? setAccountOpen(true) : void wallet.connect()}>
          {wallet.busy ? 'Opening wallet…' : wallet.account ? 'Wallet connected' : 'Connect wallet'}
        </button></div>
    </header>
    <main>
      <div className="intro"><div><h1>Make your mark.</h1><p>A shared canvas, painted on {network.name}.</p></div>
        <div className="connection-state"><span className={`state-dot ${live.fresh ? 'online' : ''}`} aria-hidden="true" /><span>{live.fresh ? 'Canvas live' : live.error ? 'Connection interrupted' : live.snapshot ? 'Canvas out of date' : 'Connecting to canvas'}</span></div>
      </div>
      <div className="workspace">
        <CanvasBoard pixels={live.snapshot?.pixels} selected={selected} select={select} color={color} unavailable={!live.snapshot} />
        <section className="paint-panel" id="paint-controls" aria-labelledby="paint-title">
          <div className="section-heading"><h2 id="paint-title">Paint a pixel</h2><span className="small muted">16 colors</span></div>
          <fieldset className="palette"><legend className="sr-only">Choose a paint color</legend>
            {PALETTE.map((paint, index) => <button type="button" key={paint.name} className={`swatch ${color === index ? 'selected' : ''}`}
              style={{ '--swatch': paint.hex } as React.CSSProperties} aria-label={`${paint.name}, color ${index}`} aria-pressed={color === index}
              title={`${paint.name} · ${index}`} onClick={() => setColor(index)}><span aria-hidden="true">{color === index ? '✓' : ''}</span></button>)}
          </fieldset>
          <div className="selection-info"><span><i className="color-sample" style={{ background: PALETTE[color].hex }} aria-hidden="true" />{PALETTE[color].name}</span>
            <span>{selected ? <><span className="muted">Pixel</span> {selected.x}, {selected.y}</> : 'No pixel selected'}</span></div>
          <button type="button" className="primary paint-action" disabled={actionDisabled} onClick={() => void primaryAction()}>{label}</button>
          <p className="gas-note">One paint every 30s. Network gas only.</p>
          <CoordinatePicker selected={selected} select={select} unavailable={!live.snapshot} />
          <div className="action-status">
            {wallet.account && !wallet.correctChain ? <p className="notice">Your wallet is on another network. Switch to {network.name} to paint.</p> :
              wallet.account && live.accountReady && !live.eligible ? <p className="cooldown-note">{live.remaining > 0 ? `Your next paint is in about ${live.remaining} seconds.` : 'The countdown is done. Waiting for chain time to catch up.'}</p> : null}
            <div role="status" aria-live="polite">{tx.message && <p className={tx.phase === 'error' ? 'notice error' : tx.phase === 'success' ? 'notice success' : 'notice'}>{tx.message}</p>}</div>
          </div>
          {(wallet.error || live.error) && <div className="notice error" role="alert"><p>{wallet.error || live.error}</p>{live.error && <button type="button" className="secondary" disabled={live.refreshing} onClick={() => void live.refresh()}>{live.refreshing ? 'Retrying…' : 'Retry connection'}</button>}</div>}
          {tx.phase === 'unconfirmed' && <button type="button" className="secondary full-width" onClick={() => void tx.recheck()}>Check confirmation</button>}
          {tx.transaction && <a className="transaction-link" href={`${network.explorer}/tx/${tx.transaction.hash}`} target="_blank" rel="noreferrer">View paint transaction ↗</a>}
          {selected && current && <p className="small muted pixel-context">Replace {current.name.toLowerCase()} with {PALETTE[color].name.toLowerCase()} at ({selected.x}, {selected.y}).{current.name === PALETTE[color].name ? ' Repainting the same color also starts your cooldown.' : ''}</p>}
          {wallet.account && <details className="wallet-details"><summary>Connected account</summary><AddressLink address={wallet.account} explorer={network.explorer} />
            <p className="small">{live.accountReady && live.snapshot?.balance !== undefined ? `${formatEther(live.snapshot.balance)} ${network.nativeCurrency.symbol} on ${network.name}` : 'Reading account balance…'}</p>
          </details>}
        </section>
        <section className="activity-panel" aria-labelledby="activity-title">
          <div className="section-heading"><h2 id="activity-title">Recent paints</h2><span className="small muted">Latest 20</span></div>
          {live.feed.events.length ? <ol className="activity-list">{live.feed.events.map(event => <li key={event.id}>
            <div className="paint-event-heading"><span><i className="color-sample" style={{ background: PALETTE[event.color]?.hex }} aria-hidden="true" />{PALETTE[event.color]?.name ?? 'Unknown color'}</span>
              <a href={`${network.explorer}/tx/${event.hash}`} target="_blank" rel="noreferrer" aria-label={`View ${PALETTE[event.color]?.name} paint at ${event.x}, ${event.y}`}>({event.x}, {event.y}) ↗</a></div>
            <AddressLink address={event.painter} explorer={network.explorer} />
          </li>)}</ol> : <div className="empty-feed"><span className="empty-pixel" aria-hidden="true" /><p>{!live.feedLoaded ? 'Loading recent paints…' : live.feed.complete ? 'A blank page for everyone.' : 'Looking for earlier paints…'}</p>
            <p className="small muted">{live.feedLoaded && live.feed.complete ? 'No paints yet. Yours can be the first.' : 'Paints appear here after confirmation.'}</p></div>}
          {!live.feed.complete && live.feed.events.length > 0 && <p className="small muted">Searching earlier blocks for more paints…</p>}
          {live.feedError && <div className="notice error"><p>{live.feedError}</p><button type="button" className="secondary" disabled={live.refreshing} onClick={() => void live.refresh()}>Retry activity</button></div>}
        </section>
      </div>
      <section className="about" aria-labelledby="about-title"><h2 id="about-title">A canvas for everyone.</h2><div><p>4,096 pixels. Anyone can change any pixel. Every paint is recorded on {network.name}, and the canvas refreshes every 4 seconds.</p>
        <p>No owner, no admin, no painting fee. Your wallet pays network gas in {network.name} test ETH. Others can paint over your pixel.</p>
        <details><summary>How painting works</summary><ol><li>Connect a browser wallet and switch to {network.name}.</li><li>Choose a color and a pixel, then confirm the paint in your wallet.</li><li>After confirmation, wait 30 seconds before painting again.</li></ol>
          <p>Need test ETH? {network.faucets.map((url, index) => <span key={url}>{index > 0 ? ' · ' : ''}<a href={url} target="_blank" rel="noreferrer">Faucet {index + 1} ↗</a></span>)}</p>
          <p>Amounts use test ETH. A USD value is unavailable. Watching the canvas needs no wallet.</p>
        </details></div></section>
    </main>
    <footer className="site-footer"><div><span className="small muted">PixelCommons contract · {network.name}</span><AddressLink address={deployment.contract.address} explorer={network.explorer} /></div>
      <div className="footer-state"><span className="small muted">{live.snapshot ? `Read block ${live.snapshot.block.toLocaleString()}` : 'Waiting for chain data'}</span><button type="button" className="secondary" disabled={live.refreshing} onClick={() => void live.refresh()}>{live.refreshing ? 'Refreshing…' : 'Refresh canvas'}</button></div></footer>
    <Dialog title="Connect a wallet" open={wallet.chooser} close={() => wallet.setChooser(false)}>
      {wallet.options.length ? <><p>Choose your browser wallet. Connecting does not send a transaction.</p><div className="wallet-options">{wallet.options.map(option => <button type="button" className="secondary" key={option.id} disabled={wallet.busy} onClick={() => void wallet.connect(option)}>Connect {option.name}</button>)}</div></> :
        <><p>No browser wallet found.</p><p>Open this page in an Ethereum wallet’s browser, or enable a browser wallet extension, then reload. You can view the canvas without one.</p></>}
      {wallet.error && <p className="notice error" role="alert">{wallet.error}</p>}
    </Dialog>
    <Dialog title="Your wallet" open={accountOpen && !!wallet.account} close={() => setAccountOpen(false)}>
      {wallet.account && <><AddressLink address={wallet.account} explorer={network.explorer} /><p>{wallet.correctChain ? `Connected to ${network.name}.` : `Switch to ${network.name} to paint.`}</p>
        <button type="button" className="secondary" onClick={() => { wallet.disconnect(); setAccountOpen(false); }}>Disconnect wallet</button><p className="small muted">Disconnecting this page does not cancel a submitted transaction.</p></>}
    </Dialog>
  </div>;
}
