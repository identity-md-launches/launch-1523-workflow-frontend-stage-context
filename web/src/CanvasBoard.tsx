import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { PALETTE, type Pixel } from './model.ts';

export function CanvasBoard({ pixels, selected, select, color, unavailable }: {
  pixels?: Uint8Array; selected?: Pixel; select: (pixel: Pixel) => void; color: number; unavailable: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState<Pixel>({ x: 31, y: 31 });
  const [hovering, setHovering] = useState(false);
  const [grid, setGrid] = useState(false);
  useEffect(() => {
    if (!pixels) return;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < pixels.length; i++) { ctx.fillStyle = PALETTE[pixels[i]].hex; ctx.fillRect(i % 64, Math.floor(i / 64), 1, 1); }
  }, [pixels]);
  useEffect(() => { if (selected) setCursor(selected); }, [selected]);

  function locate(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(63, Math.max(0, Math.floor((event.clientX - box.left) / box.width * 64))),
      y: Math.min(63, Math.max(0, Math.floor((event.clientY - box.top) / box.height * 64))) };
  }
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key.startsWith('Arrow')) {
      event.preventDefault(); setHovering(true);
      setCursor(point => ({ x: Math.min(63, Math.max(0, point.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))),
        y: Math.min(63, Math.max(0, point.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0))) }));
    }
  }
  const marked = hovering ? cursor : selected;
  const currentColor = pixels ? PALETTE[pixels[cursor.y * 64 + cursor.x]].name : 'unknown';
  return <section className="canvas-area" aria-label="Shared canvas">
    <div className="canvas-topline"><span>64 × 64 <span className="muted">pixels</span></span><label className="grid-toggle"><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} /> Show grid</label></div>
    <div className="canvas-frame">
      <button type="button" className={`canvas-board ${grid ? 'with-grid' : ''}`} aria-label={`Canvas, pixel ${cursor.x}, ${cursor.y}, ${currentColor}. Use arrow keys to move, Enter to select.`}
        aria-describedby="canvas-help" aria-disabled={unavailable} onKeyDown={onKey}
        onMouseMove={event => { setCursor(locate(event)); setHovering(true); }} onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)} onBlur={() => setHovering(false)}
        onClick={event => { if (!unavailable) select(event.detail === 0 ? cursor : locate(event)); }}>
        <canvas ref={canvas} width="64" height="64" aria-hidden="true" />
        {grid && <span className="pixel-grid" aria-hidden="true" />}
        {marked && pixels && <span className="pixel-marker" aria-hidden="true" style={{ left: `${marked.x / 64 * 100}%`, top: `${marked.y / 64 * 100}%`, backgroundColor: PALETTE[color].hex }} />}
        {!pixels && <span className="canvas-placeholder">{unavailable ? 'Waiting for the canvas' : 'Loading canvas…'}<span>Live pixels appear here</span></span>}
      </button>
    </div>
    <div className="canvas-bottomline"><span id="canvas-help">Choose a color. Select a pixel.</span><span className="coordinate-readout" aria-hidden="true">{selected ? `${selected.x}, ${selected.y}` : '0–63'}</span></div>
  </section>;
}

export function CoordinatePicker({ selected, select, unavailable }: { selected?: Pixel; select: (pixel: Pixel) => void; unavailable: boolean }) {
  const [x, setX] = useState('31');
  const [y, setY] = useState('31');
  useEffect(() => { if (selected) { setX(String(selected.x)); setY(String(selected.y)); } }, [selected]);
  return <details className="coordinate-details"><summary>Choose exact coordinates</summary>
      <form className="coordinate-form" onSubmit={event => { event.preventDefault(); select({ x: Number(x), y: Number(y) }); }}>
        <label>Column <input name="x" type="number" inputMode="numeric" min="0" max="63" step="1" required value={x} onChange={e => setX(e.target.value)} /></label>
        <label>Row <input name="y" type="number" inputMode="numeric" min="0" max="63" step="1" required value={y} onChange={e => setY(e.target.value)} /></label>
        <button type="submit" className="secondary" disabled={unavailable}>Select pixel</button>
      </form>
      <p className="small muted">Coordinates start at 0 in the top-left. Arrow keys also move around the canvas.</p>
    </details>;
}
