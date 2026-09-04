'use client';

import { useEffect, useRef, useState } from 'react';
import { PathEditor } from '@/components/PathEditor';
import { downloadFont, downloadSvg } from '@/lib/download';
import { THEME_ORDER, THEMES, type ThemeName } from '@/lib/themes';
import { useGlyfStudio, type Status } from '@/lib/useGlyfStudio';

const EXAMPLES = [
  'art deco gold leaf',
  'geometric sans',
  'ornate serif',
];

const GUIDES = [
  { y: 215, label: 'ASC' },
  { y: 265, label: 'CAP' },
  { y: 540, label: 'X' },
  { y: 750, label: 'BL' },
  { y: 830, label: 'DESC' },
];

const V_TICKS = [0, 250, 500, 750, 1000];

export default function Home() {
  const s = useGlyfStudio({ anchorsVisibleDefault: false });
  const [theme, setTheme] = useState<ThemeName>('plain');

  function applyTheme(name: ThemeName) {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(THEMES[name])) {
      root.style.setProperty(k, v);
    }
    setTheme(name);
    try {
      localStorage.setItem('glyf-theme', name);
    } catch {}
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('glyf-theme') as ThemeName | null;
      if (saved && THEMES[saved]) applyTheme(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    'flex w-24 shrink-0 items-baseline whitespace-nowrap font-metric text-[11px] lowercase tracking-[0.22em] text-grey';
  const zoomKey =
    'neu-key rounded-[5px] bg-[color-mix(in_srgb,var(--paper)_40%,var(--sheet))] px-2.5 py-1 font-metric text-[10px] lowercase tracking-[0.18em] text-ink transition-colors hover:text-pen disabled:cursor-not-allowed disabled:bg-transparent disabled:text-faint';
  const word =
    'font-metric text-[12px] font-medium lowercase tracking-[0.18em] text-ink underline decoration-construction decoration-dotted underline-offset-4 transition-colors hover:text-pen hover:decoration-pen disabled:cursor-not-allowed disabled:text-faint disabled:no-underline';

  return (
    <main className="mx-auto max-w-5xl px-8 py-8 font-metric">
      <header className="relative flex items-end justify-between border-b border-construction pb-3">
        <h1 className="translate-y-[15px] font-wordmark text-6xl italic leading-[0.85] tracking-[-0.02em]">
          Glyf
        </h1>
        <span
          aria-hidden
          className="absolute -bottom-px left-0 h-px w-[160px] bg-[linear-gradient(90deg,var(--pen)_0%,var(--pen)_72%,transparent_100%)]"
        />
        <div className="flex items-center gap-x-1.5 pb-1">
          {THEME_ORDER.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => applyTheme(name)}
              className={`size-5 rounded-[3px] transition-shadow ${
                theme === name ? 'neu-raised' : ''
              }`}
              style={{ background: THEMES[name]['--swatch'] }}
            />
          ))}
        </div>
      </header>

      <section className="grid grid-cols-[1fr_1.3fr] items-start gap-10 border-b border-construction py-7">
        <div className="space-y-8">
          <div>
            <div className="flex items-baseline gap-3">
              <span className={label}>vibe</span>
              <input
                type="text"
                value={s.vibe}
                onChange={(e) => s.setVibe(e.target.value)}
                disabled={s.isStreaming}
                className="w-full border-0 border-b border-construction bg-transparent pb-1 font-metric text-sm caret-pen placeholder:text-faint focus:border-ink focus:outline-none disabled:opacity-50"
              />
            </div>
            <div className="ml-[108px] mt-2 whitespace-nowrap font-wordmark text-[11.5px] italic leading-[1.55] text-grey">
              {EXAMPLES.map((ex, i) => (
                <span key={ex}>
                  {i > 0 && <span className="mx-1.5">·</span>}
                  <button
                    type="button"
                    onClick={() => s.setVibe(ex)}
                    disabled={s.isStreaming}
                    className="transition-colors hover:text-pen disabled:hover:text-grey"
                  >
                    “{ex}”
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-baseline gap-3">
            <span className={label}>letter</span>
            <input
              type="text"
              value={s.letter}
              onChange={(e) => s.setLetter(e.target.value.slice(0, 1))}
              maxLength={1}
              disabled={s.batchMode || s.isStreaming}
              className="w-14 border-0 border-b border-construction bg-transparent pb-1 text-center font-metric text-2xl caret-pen focus:border-ink focus:outline-none disabled:opacity-30"
            />
            <button
              type="button"
              onClick={() => s.setBatchMode(!s.batchMode)}
              disabled={s.isStreaming}
              className="ml-4 font-metric text-[10px] lowercase tracking-[0.18em] text-grey transition-colors hover:text-pen disabled:hover:text-grey"
            >
              <span className="mr-1 inline-block w-3 text-center">
                {s.batchMode ? '■' : '☐'}
              </span>
              batch
            </button>
            <button
              type="button"
              onClick={s.handleGenerate}
              disabled={!s.vibe || (!s.batchMode && !s.letter) || s.isStreaming}
              className="neu-key ml-4 rounded-md bg-[color-mix(in_srgb,var(--paper)_40%,var(--sheet))] px-5 py-2 font-metric text-[12px] lowercase tracking-[0.18em] text-ink transition-shadow disabled:cursor-not-allowed disabled:text-faint"
            >
              draw
            </button>
          </div>

          <div className="flex items-baseline gap-3">
            <span className={label}>download</span>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <button
                type="button"
                onClick={() => downloadSvg(s.svg, s.letter || 'glyph')}
                disabled={!s.canDownload || !s.svg}
                className={word}
              >
                svg
              </button>
              <button
                type="button"
                onClick={() => downloadFont(s.library)}
                disabled={s.libraryChars.length === 0}
                className={word}
              >
                font
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-3">
              <span className={label}>view</span>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, +(s.zoom - 0.25).toFixed(2));
                    s.setZoom(next);
                    if (next <= 1) s.setPan({ x: 0, y: 0 });
                  }}
                  disabled={!s.hasGlyph || s.zoom <= 1}
                  className={zoomKey}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => {
                    s.setZoom(1);
                    s.setPan({ x: 0, y: 0 });
                  }}
                  className="px-1 font-metric text-[10px] tracking-[0.18em] text-grey transition-colors hover:text-pen"
                >
                  {Math.round(s.zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() =>
                    s.setZoom(Math.min(5, +(s.zoom + 0.25).toFixed(2)))
                  }
                  disabled={!s.hasGlyph || s.zoom >= 5}
                  className={zoomKey}
                >
                  +
                </button>
              </div>
            </div>
            <p className="ml-[108px] mt-3 font-wordmark text-[12px] italic text-grey">
              {s.zoom > 1
                ? 'hold space + drag to pan'
                : '⌘/ctrl + scroll to zoom'}
            </p>
          </div>

          <div className="flex items-baseline gap-3">
            <span className={label}>edit</span>
            <div className="flex flex-col gap-y-3">
              <div className="flex items-baseline gap-x-5">
                <button
                  type="button"
                  onClick={s.undo}
                  disabled={!s.hasGlyph || (s.editHistory[s.letter]?.length ?? 0) === 0}
                  className={word}
                >
                  undo
                </button>
                <button
                  type="button"
                  onClick={s.redo}
                  disabled={!s.hasGlyph || (s.redoHistory[s.letter]?.length ?? 0) === 0}
                  className={word}
                >
                  redo
                </button>
                <button
                  type="button"
                  onClick={s.handleSoftenSelection}
                  disabled={!s.hasGlyph || s.selectedAnchors.size === 0}
                  className={word}
                >
                  soften
                </button>
                <button
                  type="button"
                  onClick={s.handleFit}
                  disabled={!s.canFit}
                  className={word}
                >
                  fit
                </button>
                <button
                  type="button"
                  onClick={s.handleClean}
                  disabled={!s.hasGlyph}
                  className={word}
                >
                  clean
                </button>
              </div>
                <button
                  type="button"
                  onClick={() => s.setAnchorsVisible(!s.anchorsVisible)}
                  style={{ alignSelf: 'flex-start' }}
                  className="font-metric text-[10px] lowercase tracking-[0.18em] text-grey transition-colors hover:text-pen"
                >
                  <span className="mr-1 inline-block w-3 text-center">
                    {s.anchorsVisible ? '■' : '☐'}
                  </span>
                  anchors
                </button>
              </div>
          </div>
        </div>

        <Specimen s={s} />
      </section>

      <footer className="flex items-center justify-between pt-4 font-metric text-[11px] lowercase tracking-[0.22em] text-grey">
<span>status · {statusLabel(s.status)}</span>
        <span className={s.status.kind === 'error' ? 'text-pen' : undefined}>
          {statusMeta(s.status, s.elapsed)}
        </span>
      </footer>

      {s.libraryChars.length > 0 && (
        <section className="mt-10 border-t border-construction pt-7">
          <div className="mb-4 flex items-baseline justify-between font-metric text-[11px] lowercase tracking-[0.22em]">
            <span className="text-grey">
              library · {s.libraryChars.length} glyph
              {s.libraryChars.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear the whole library?')) s.setLibrary({});
              }}
              className="underline decoration-construction decoration-dotted underline-offset-4 text-grey transition-colors hover:text-pen hover:decoration-pen"
            >
              clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.libraryChars.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => s.selectFromLibrary(ch)}
                className={`group flex h-16 w-16 flex-col items-center justify-center rounded-md bg-sheet transition-shadow ${
                  ch === s.letter ? 'neu-raised' : ''
                }`}
                title={`${ch} · "${s.library[ch].vibe}"`}
              >
                <div
                  className="glyf-tile h-11 w-11 [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: s.library[ch].svg }}
                />
                <span className="mt-0.5 font-metric text-[9px] lowercase tracking-[0.1em] text-grey group-hover:text-pen">
                  {ch === ' ' ? '␣' : ch}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {s.libraryChars.length > 0 && (
        <section className="mt-8 border-t border-construction pt-7">
          <span className="font-metric text-[11px] lowercase tracking-[0.22em] text-grey">
            preview
          </span>
          <div
            className="mt-3 min-h-[5rem] break-words text-6xl leading-tight"
            style={{
              fontFamily:
                'GlyfPreview, "Helvetica Neue", Helvetica, sans-serif',
            }}
          >
            {s.typeText || (
              <span className="font-wordmark text-[15px] italic text-grey">
                type below to preview
              </span>
            )}
          </div>
          <textarea
            value={s.typeText}
            onChange={(e) => s.setTypeText(e.target.value)}
            rows={2}
            placeholder="The quick brown fox..."
            className="mt-4 w-full border-0 border-b border-construction bg-transparent pb-2 font-metric text-sm caret-pen placeholder:text-faint focus:border-ink focus:outline-none"
          />
        </section>
      )}
    </main>
  );
}

function statusLabel(status: Status) {
  switch (status.kind) {
    case 'idle':
      return 'awaiting input';
    case 'generating':
      return 'generating';
    case 'complete':
      return 'complete';
    case 'error':
      return 'error';
  }
}

function statusMeta(status: Status, elapsed: number) {
  switch (status.kind) {
    case 'idle':
      return '—';
    case 'generating':
      if (status.total > 1) {
        return `${status.current} · ${status.done}/${status.total} · T+ ${elapsed.toFixed(2)} s`;
      }
      return `${status.current} · T+ ${elapsed.toFixed(2)} s`;
    case 'complete':
      return `${(status.durationMs / 1000).toFixed(2)} s · ${status.generated} letter${status.generated === 1 ? '' : 's'}`;
    case 'error':
      return status.message;
  }
}

function Specimen({ s }: { s: ReturnType<typeof useGlyfStudio> }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { zoom, setZoom } = s;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.005;
      const next = Math.max(1, Math.min(5, +(zoom + delta).toFixed(2)));
      setZoom(next);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, setZoom]);

  return (
    <div>
      <div className="relative mb-2 mr-16 h-3">
        {V_TICKS.map((t) => (
          <span
            key={t}
            className="absolute font-metric text-[9px] text-faint"
            style={{
              left: `${(t / 1000) * 100}%`,
              transform:
                t === 0
                  ? 'translateX(0)'
                  : t === 1000
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="flex gap-3">
        <div
          ref={canvasRef}
          className="neu-inset neu-well relative aspect-square flex-1 overflow-hidden rounded-md"
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${s.pan.x}px, ${s.pan.y}px) scale(${s.zoom})`,
              transformOrigin: 'center',
            }}
          >
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
            >
              {GUIDES.map((g) => (
                <line
                  key={`h-${g.label}`}
                  x1={0}
                  x2={1000}
                  y1={g.y}
                  y2={g.y}
                  stroke="var(--hairline)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {[250, 500, 750].map((x) => (
                <line
                  key={`v-${x}`}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={1000}
                  stroke="var(--hairline)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            <div
              className={`glyf-svg absolute inset-0 [&_svg]:h-full [&_svg]:w-full${
                s.isStreaming ? ' is-streaming' : ''
              }`}
              dangerouslySetInnerHTML={{ __html: s.svg }}
            />
            <PathEditor
              svg={s.svg}
              onChange={s.handlePathChange}
              disabled={s.isStreaming || s.idle || !s.anchorsVisible}
              selectedIds={s.selectedAnchors}
              onSelectionChange={s.setSelectedAnchors}
              zoom={s.zoom}
              pan={s.pan}
              onPanChange={s.setPan}
            />
          </div>
          {s.idle && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-wordmark italic text-grey">
              awaiting input.
            </div>
          )}
        </div>
        <div className="relative w-14">
          {GUIDES.map((g) => (
            <div
              key={g.label}
              className="absolute flex w-full items-baseline justify-between font-metric text-[10px] uppercase tracking-[0.1em]"
              style={{
                top: `${(g.y / 1000) * 100}%`,
                transform: 'translateY(-50%)',
              }}
            >
              <span className="text-faint">{g.label}</span>
              <span className="text-faint">{g.y}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
