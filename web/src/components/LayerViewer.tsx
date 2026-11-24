// The slice image viewer (PLAN.md §1c): the scan with any layers on top, zoom and pan, a before/after
// slider (original against lighting-corrected) and an A vs B slider (each method's dead map on one side).
// Layer PNGs need the token, so they are fetched once and shown through object URLs.

import { type PointerEvent, type WheelEvent, useEffect, useRef, useState } from 'react';
import type { EngineClient } from '../api/client';
import type { Layer, LayerInfo } from '../api/types.gen';
import { LAYER_COLOUR } from '../lib/layers';

export type ViewMode = 'layers' | 'before-after' | 'a-vs-b';

function useLayerUrls(client: EngineClient, sliceId: string, wanted: Layer[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  // Every layer asked for, by "<slice>/<layer>": its object URL, or '' while it loads.
  const known = useRef(new Map<string, string>());
  const key = wanted.join(',');

  useEffect(() => {
    for (const layer of key.split(',') as Layer[]) {
      const k = `${sliceId}/${layer}`;
      if (known.current.has(k)) continue;
      known.current.set(k, '');
      client
        .layerUrl(sliceId, layer)
        .then((url) => {
          if (!known.current.has(k)) {
            URL.revokeObjectURL(url); // the slice was left while it loaded
            return;
          }
          known.current.set(k, url);
          setUrls((u) => ({ ...u, [k]: url }));
        })
        .catch((e: unknown) => {
          known.current.delete(k);
          setError(String(e));
        });
    }
  }, [client, sliceId, key]);

  // Free a slice's images when another slice is shown or the viewer goes away.
  useEffect(() => {
    const map = known.current;
    return () => {
      for (const [k, url] of map) {
        if (!k.startsWith(`${sliceId}/`)) continue;
        if (url) URL.revokeObjectURL(url);
        map.delete(k);
      }
    };
  }, [sliceId]);

  return { url: (layer: Layer): string | undefined => urls[`${sliceId}/${layer}`] || undefined, error };
}

function Mask({ url, colour, opacity, clip }: { url?: string; colour: string; opacity: number; clip?: string }) {
  if (!url) return null;
  const image = `url(${url})`;
  return (
    <div
      className="viewer-layer"
      style={{
        background: colour,
        opacity,
        maskImage: image,
        WebkitMaskImage: image,
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
        clipPath: clip,
      }}
    />
  );
}

interface Props {
  client: EngineClient;
  sliceId: string;
  width: number;
  height: number;
  available: Layer[];
  infos: LayerInfo[];
  /** Overlays to start with. */
  initial?: Layer[];
}

export function LayerViewer({ client, sliceId, width, height, available, infos, initial = ['a_dead'] }: Props) {
  const [mode, setMode] = useState<ViewMode>('layers');
  const [base, setBase] = useState<'original' | 'corrected'>('corrected');
  const [on, setOn] = useState<Set<Layer>>(() => new Set(initial.filter((l) => available.includes(l))));
  const [opacity, setOpacity] = useState(0.6);
  const [split, setSplit] = useState(50);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  const overlays = infos.filter((i) => i.kind !== 'photo' && available.includes(i.key));
  const wanted: Layer[] =
    mode === 'before-after'
      ? ['original', 'corrected']
      : mode === 'a-vs-b'
        ? ['corrected', 'a_dead', 'b_dead']
        : [base, ...on];
  const { url, error } = useLayerUrls(client, sliceId, wanted);

  const toggle = (l: Layer) =>
    setOn((s) => {
      const next = new Set(s);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });

  const zoomTo = (scale: number, cx = 0.5, cy = 0.5) => {
    const s = Math.min(8, Math.max(1, scale));
    setView((v) => {
      if (s === 1) return { scale: 1, x: 0, y: 0 };
      // Keep the point under (cx, cy) of the frame where it is.
      const k = s / v.scale;
      const el = frame.current;
      const w = el?.clientWidth ?? 1;
      const h = el?.clientHeight ?? 1;
      return { scale: s, x: cx * w - k * (cx * w - v.x), y: cy * h - k * (cy * h - v.y) };
    });
  };

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && view.scale === 1 && e.deltaY > 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    zoomTo(view.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };
  const onDown = (e: PointerEvent) => {
    if (view.scale === 1 || (e.target as HTMLElement).closest('input')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const onUp = () => {
    drag.current = null;
  };

  const left = `inset(0 ${100 - split}% 0 0)`;
  const right = `inset(0 0 0 ${split}%)`;
  const titleOf = (l: Layer) => infos.find((i) => i.key === l)?.title ?? l;

  return (
    <div className="viewer" data-tour="layers">
      <div className="viewer-bar">
        <div className="switch" role="radiogroup" aria-label="View">
          {(
            [
              ['layers', 'Layers'],
              ['before-after', 'Before / after'],
              ['a-vs-b', 'A vs B'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className="switch-option button ghost"
              style={{ border: 'none', minHeight: 0 }}
              onClick={() => setMode(m)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="button small" aria-label="Zoom out" onClick={() => zoomTo(view.scale / 1.5)} disabled={view.scale <= 1}>
            −
          </button>
          <span className="fine num" style={{ minWidth: 44, textAlign: 'center' }}>
            {Math.round(view.scale * 100)}%
          </span>
          <button type="button" className="button small" aria-label="Zoom in" onClick={() => zoomTo(view.scale * 1.5)} disabled={view.scale >= 8}>
            +
          </button>
          <button type="button" className="button small" onClick={() => zoomTo(1)} disabled={view.scale === 1}>
            Fit
          </button>
        </div>
      </div>

      <div
        ref={frame}
        className={`viewer-frame ${view.scale > 1 ? 'zoomed' : ''}`}
        style={{ aspectRatio: `${width} / ${height}` }}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label={
          mode === 'layers'
            ? `Slice scan (${base === 'original' ? 'original' : 'lighting corrected'})${on.size ? ` with ${[...on].map(titleOf).join(', ')}` : ''}`
            : mode === 'before-after'
              ? 'Original scan on the left, lighting corrected on the right'
              : 'Method A dead tissue on the left, Method B dead tissue on the right'
        }
      >
        <div className="viewer-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {mode === 'layers' && (
            <>
              {url(base) && <img className="viewer-layer" src={url(base)} alt="" draggable={false} />}
              {overlays
                .filter((i) => on.has(i.key))
                .map((i) =>
                  i.kind === 'heatmap' ? (
                    url(i.key) && <img key={i.key} className="viewer-layer" src={url(i.key)} alt="" style={{ opacity }} draggable={false} />
                  ) : (
                    <Mask key={i.key} url={url(i.key)} colour={LAYER_COLOUR[i.key] ?? '#f2c14e'} opacity={opacity} />
                  ),
                )}
            </>
          )}
          {mode === 'before-after' && (
            <>
              {url('corrected') && <img className="viewer-layer" src={url('corrected')} alt="" draggable={false} />}
              {url('original') && <img className="viewer-layer" src={url('original')} alt="" style={{ clipPath: left }} draggable={false} />}
            </>
          )}
          {mode === 'a-vs-b' && (
            <>
              {url('corrected') && <img className="viewer-layer" src={url('corrected')} alt="" draggable={false} />}
              <Mask url={url('a_dead')} colour="var(--method-a)" opacity={opacity} clip={left} />
              <Mask url={url('b_dead')} colour="var(--method-b)" opacity={opacity} clip={right} />
            </>
          )}
        </div>
        {mode !== 'layers' && <div className="viewer-divider" style={{ left: `${split}%` }} aria-hidden="true" />}
        {!url(mode === 'layers' ? base : 'corrected') && !error && (
          <div className="viewer-loading">
            <span className="spinner" aria-hidden="true" /> Loading the scan…
          </div>
        )}
      </div>

      {error && <p className="note error">{error}</p>}

      {mode !== 'layers' && (
        <label className="viewer-slider">
          <span className="fine">{mode === 'before-after' ? 'Original' : <><span className="dot a" />Method A dead</>}</span>
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Divider position" />
          <span className="fine">{mode === 'before-after' ? 'Lighting corrected' : <><span className="dot b" />Method B dead</>}</span>
        </label>
      )}

      {mode === 'layers' && (
        <div className="viewer-controls">
          <div className="row" style={{ gap: 6 }}>
            <span className="fine">Scan:</span>
            {(['corrected', 'original'] as const).map((b) => (
              <label key={b} className="check fine">
                <input type="radio" name={`base-${sliceId}`} checked={base === b} onChange={() => setBase(b)} />
                {b === 'corrected' ? 'Lighting corrected' : 'Original'}
              </label>
            ))}
          </div>
          <div className="layer-toggles" role="group" aria-label="Layers">
            {overlays.map((i) => (
              <label key={i.key} className="layer-toggle" title={i.description}>
                <input type="checkbox" checked={on.has(i.key)} onChange={() => toggle(i.key)} />
                {i.kind === 'heatmap' ? (
                  <span className="swatch heat" aria-hidden="true" />
                ) : (
                  <span className="swatch" style={{ background: LAYER_COLOUR[i.key] }} aria-hidden="true" />
                )}
                {i.title}
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="viewer-slider">
        <span className="fine">Layer strength</span>
        <input type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} aria-label="Layer strength" />
        <span className="fine num">{Math.round(opacity * 100)}%</span>
      </label>
      {mode === 'layers' && on.has('a_probability') && (
        <div className="heat-legend fine" aria-label="Probability of dead, from 0 to 1">
          <span>p = 0 (alive)</span>
          <span className="heat-bar" aria-hidden="true" />
          <span>1 (dead)</span>
        </div>
      )}
      <p className="fine">Drag to move when zoomed; scroll with Ctrl (⌘ on a Mac) to zoom at the pointer.</p>
    </div>
  );
}
