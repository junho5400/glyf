'use client';

import { useEffect, useRef, useState } from 'react';
import { PathEditor } from '@/components/PathEditor';
import { centerSvg } from '@/lib/center';
import { downloadFont, downloadSvg } from '@/lib/download';
import { libraryToTtf } from '@/lib/font';
import {
  BATCH_SET,
  loadLibrary,
  saveLibrary,
  type Library,
} from '@/lib/library';
import {
  extractD,
  fitLetter,
  parsePath,
  replaceD,
  serializePath,
  simplifyPath,
  softenAnchors,
} from '@/lib/pathOps';
import { sanitizeSvg } from '@/lib/sanitize';

async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!raw.startsWith('data: ')) continue;
        try {
          yield JSON.parse(raw.slice(6));
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const EXAMPLES = [
  'art deco gold leaf',
  'geometric sans',
  'ornate serif',
  'brutalist condensed',
];

const GUIDES = [
  { y: 215, label: 'ASC' },
  { y: 265, label: 'CAP' },
  { y: 540, label: 'X' },
  { y: 750, label: 'BL' },
  { y: 830, label: 'DESC' },
];

const V_TICKS = [0, 250, 500, 750, 1000];

type Status =
  | { kind: 'idle' }
  | {
      kind: 'generating';
      startedAt: number;
      current: string;
      done: number;
      total: number;
    }
  | { kind: 'complete'; durationMs: number; generated: number }
  | { kind: 'error'; message: string };

export default function Home() {
  const [vibe, setVibe] = useState('');
  const [letter, setLetter] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [svg, setSvg] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const [library, setLibrary] = useState<Library>({});
  const [libraryReady, setLibraryReady] = useState(false);
  const [typeText, setTypeText] = useState('');
  const [editHistory, setEditHistory] = useState<Record<string, string[]>>({});
  const [redoHistory, setRedoHistory] = useState<Record<string, string[]>>({});
  const [anchorsVisible, setAnchorsVisible] = useState(true);
  const [selectedAnchors, setSelectedAnchors] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setLibrary(loadLibrary());
    setLibraryReady(true);
  }, []);

  useEffect(() => {
    if (!libraryReady) return;
    saveLibrary(library);
  }, [library, libraryReady]);

  useEffect(() => {
    const chars = Object.keys(library);
    if (chars.length === 0) return;
    let cancelled = false;
    const update = async () => {
      try {
        const buf = libraryToTtf(library);
        const ranges = chars
          .map((c) => {
            const cp = c.codePointAt(0);
            return cp === undefined
              ? null
              : `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
          })
          .filter((s): s is string => s !== null)
          .join(',');
        const fontFace = new FontFace('GlyfPreview', buf, {
          unicodeRange: ranges,
        });
        await fontFace.load();
        if (cancelled) return;
        const toRemove: FontFace[] = [];
        document.fonts.forEach((ff) => {
          if (ff.family === 'GlyfPreview') toRemove.push(ff);
        });
        toRemove.forEach((ff) => document.fonts.delete(ff));
        document.fonts.add(fontFace);
      } catch (err) {
        console.error('Font preview load failed', err);
      }
    };
    update();
    return () => {
      cancelled = true;
    };
  }, [library]);

  useEffect(() => {
    if (status.kind !== 'generating') return;
    const startedAt = status.startedAt;
    const interval = setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 50);
    return () => clearInterval(interval);
  }, [status]);

  async function generateOne(vibeText: string, char: string) {
    setSvg('');
    let finalSvg = '';
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vibe: vibeText, letter: char }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    let buf = '';
    for await (const event of readSse(res.body)) {
      const e = event as { text?: string; done?: boolean };
      if (e.done) break;
      if (typeof e.text !== 'string') continue;
      buf += e.text;
      finalSvg = centerSvg(sanitizeSvg(buf));
      setSvg(finalSvg);
    }
    setLibrary((prev) => ({
      ...prev,
      [char]: {
        letter: char,
        svg: finalSvg,
        vibe: vibeText,
        createdAt: Date.now(),
      },
    }));
    setEditHistory((h) => ({ ...h, [char]: [] }));
    setRedoHistory((h) => ({ ...h, [char]: [] }));
  }

  async function handleGenerate() {
    if (!vibe) return;
    const chars = batchMode ? BATCH_SET : letter ? [letter] : [];
    if (chars.length === 0) return;
    const startedAt = Date.now();
    setElapsed(0);
    try {
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        setStatus({
          kind: 'generating',
          startedAt,
          current: ch,
          done: i,
          total: chars.length,
        });
        await generateOne(vibe, ch);
      }
      setStatus({
        kind: 'complete',
        durationMs: Date.now() - startedAt,
        generated: chars.length,
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  function selectFromLibrary(char: string) {
    const item = library[char];
    if (!item) return;
    setSvg(item.svg);
    setLetter(char);
    setStatus({ kind: 'complete', durationMs: 0, generated: 1 });
  }

  function handlePathChange(newSvg: string, final: boolean) {
    if (
      final &&
      letter &&
      library[letter] &&
      library[letter].svg !== newSvg
    ) {
      const prevSvg = library[letter].svg;
      setEditHistory((h) => ({
        ...h,
        [letter]: [...(h[letter] ?? []), prevSvg].slice(-50),
      }));
      setRedoHistory((h) => ({ ...h, [letter]: [] }));
    }
    setSvg(newSvg);
    if (final && letter && library[letter]) {
      setLibrary((prev) => ({
        ...prev,
        [letter]: { ...prev[letter], svg: newSvg },
      }));
    }
  }

  function undo() {
    if (!letter) return;
    const stack = editHistory[letter];
    if (!stack || stack.length === 0) return;
    const prevSvg = stack[stack.length - 1];
    const currentSvg = library[letter]?.svg ?? svg;
    setSvg(prevSvg);
    setLibrary((prev) =>
      prev[letter]
        ? { ...prev, [letter]: { ...prev[letter], svg: prevSvg } }
        : prev,
    );
    setEditHistory((h) => ({
      ...h,
      [letter]: stack.slice(0, -1),
    }));
    setRedoHistory((h) => ({
      ...h,
      [letter]: [...(h[letter] ?? []), currentSvg].slice(-50),
    }));
  }

  function handleFit() {
    if (!svg || !letter) return;
    const newSvg = fitLetter(svg, letter);
    if (newSvg === svg) return;
    handlePathChange(newSvg, true);
  }

  function handleClean() {
    if (!svg || !letter || !library[letter]) return;
    const d = extractD(svg);
    if (!d) return;
    const newD = simplifyPath(d);
    if (newD === d) return;
    handlePathChange(replaceD(svg, newD), true);
  }

  function handleSoftenSelection() {
    if (!svg || !letter || selectedAnchors.size === 0) return;
    const d = extractD(svg);
    if (!d) return;
    const ops = parsePath(d);
    const newOps = softenAnchors(ops, selectedAnchors);
    const newD = serializePath(newOps);
    if (newD === d) return;
    handlePathChange(replaceD(svg, newD), true);
    setSelectedAnchors(new Set());
  }

  function redo() {
    if (!letter) return;
    const stack = redoHistory[letter];
    if (!stack || stack.length === 0) return;
    const nextSvg = stack[stack.length - 1];
    const currentSvg = library[letter]?.svg ?? svg;
    setSvg(nextSvg);
    setLibrary((prev) =>
      prev[letter]
        ? { ...prev, [letter]: { ...prev[letter], svg: nextSvg } }
        : prev,
    );
    setEditHistory((h) => ({
      ...h,
      [letter]: [...(h[letter] ?? []), currentSvg].slice(-50),
    }));
    setRedoHistory((h) => ({
      ...h,
      [letter]: stack.slice(0, -1),
    }));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const isUndo =
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z' &&
        !e.shiftKey;
      const isRedo =
        ((e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === 'z' &&
          e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y');
      if (isUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter, editHistory, redoHistory, library]);

  const isStreaming = status.kind === 'generating';
  const idle = status.kind === 'idle' && !svg;
  const canDownload = status.kind === 'complete' || svg !== '';
  const libraryChars = Object.keys(library);

  return (
    <main className="mx-auto max-w-5xl px-8 py-8">
      <header className="border-b border-hairline pb-3">
        <h1 className="font-serif italic text-6xl leading-[0.85] tracking-[-0.02em]">
          Glyf
        </h1>
      </header>

      <section className="grid grid-cols-[1fr_1.3fr] items-start gap-10 border-b border-hairline py-7">
        <div className="space-y-5">
          <div>
            <div className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
                Vibe ──
              </span>
              <input
                type="text"
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                disabled={isStreaming}
                className="w-full border-0 border-b border-hairline bg-transparent pb-1 font-mono text-sm placeholder:text-mute focus:border-ink focus:outline-none disabled:opacity-50"
              />
            </div>
            <div className="ml-28 mt-2 font-serif italic text-[13px] leading-[1.55] text-mute">
              {EXAMPLES.map((ex, i) => (
                <span key={ex}>
                  {i > 0 && <span className="mx-1.5">·</span>}
                  <button
                    type="button"
                    onClick={() => setVibe(ex)}
                    disabled={isStreaming}
                    className="transition-colors hover:text-ink disabled:hover:text-mute"
                  >
                    “{ex}”
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-baseline gap-4">
            <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
              Letter ──
            </span>
            <input
              type="text"
              value={letter}
              onChange={(e) => setLetter(e.target.value.slice(0, 1))}
              maxLength={1}
              disabled={batchMode || isStreaming}
              className="w-14 border-0 border-b border-hairline bg-transparent pb-1 text-center font-mono text-2xl focus:border-ink focus:outline-none disabled:opacity-30"
            />
            <button
              type="button"
              onClick={() => setBatchMode((b) => !b)}
              disabled={isStreaming}
              className="ml-4 font-mono text-[10px] uppercase tracking-[0.18em] text-mute transition-colors hover:text-ink disabled:hover:text-mute"
            >
              {batchMode ? '■' : '☐'} batch
            </button>
          </div>
          {batchMode && (
            <p className="ml-28 -mt-2 font-serif italic text-[12px] text-mute">
              71 glyphs · A–Z, a–z, 0–9, .,!?:;-&apos;&quot;
            </p>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={
                !vibe || (!batchMode && !letter) || isStreaming
              }
              className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute disabled:cursor-not-allowed disabled:text-mute"
            >
              [ generate{batchMode ? ' all' : ''} ]
            </button>
          </div>

          {(canDownload && svg) || libraryChars.length > 0 ? (
            <div className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
                Download ──
              </span>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                {canDownload && svg && (
                  <button
                    type="button"
                    onClick={() => downloadSvg(svg, letter || 'glyph')}
                    className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute"
                  >
                    [ svg ]
                  </button>
                )}
                {libraryChars.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadFont(library)}
                    className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute"
                  >
                    [ font ]
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {letter && library[letter] ? (
            <div className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
                View ──
              </span>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, +(zoom - 0.25).toFixed(2));
                    setZoom(next);
                    if (next <= 1) setPan({ x: 0, y: 0 });
                  }}
                  disabled={zoom <= 1}
                  className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute disabled:cursor-not-allowed disabled:text-mute"
                >
                  [ − ]
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-mute transition-colors hover:text-ink"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)))}
                  disabled={zoom >= 5}
                  className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute disabled:cursor-not-allowed disabled:text-mute"
                >
                  [ + ]
                </button>
                <span className="font-serif italic text-[12px] text-mute">
                  {zoom > 1
                    ? 'hold space + drag to pan'
                    : '⌘/ctrl + scroll to zoom'}
                </span>
              </div>
            </div>
          ) : null}

          {letter && library[letter] ? (
            <div className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
                Edit ──
              </span>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                {(editHistory[letter]?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={undo}
                    className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute"
                  >
                    [ undo ]
                  </button>
                )}
                {(redoHistory[letter]?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={redo}
                    className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute"
                  >
                    [ redo ]
                  </button>
                )}
                {selectedAnchors.size > 0 && (
                  <button
                    type="button"
                    onClick={handleSoftenSelection}
                    className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute"
                  >
                    [ soften ({selectedAnchors.size}) ]
                  </button>
                )}
                {/[A-Za-z]/.test(letter) && !/[gjpqy]/.test(letter) && (
                  <button
                    type="button"
                    onClick={handleFit}
                    className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute"
                  >
                    [ fit ]
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClean}
                  className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute"
                >
                  [ clean ]
                </button>
                <button
                  type="button"
                  onClick={() => setAnchorsVisible((v) => !v)}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-mute transition-colors hover:text-ink"
                >
                  {anchorsVisible ? '■' : '☐'} anchors
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <Specimen
          svg={svg}
          isStreaming={isStreaming}
          idle={idle}
          anchorsVisible={anchorsVisible}
          selectedAnchors={selectedAnchors}
          onSelectionChange={setSelectedAnchors}
          onPathChange={handlePathChange}
          zoom={zoom}
          onZoomChange={(z) => {
            setZoom(z);
            if (z <= 1) setPan({ x: 0, y: 0 });
          }}
          pan={pan}
          onPanChange={setPan}
        />
      </section>

      <footer className="flex items-center justify-between pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
        <span>Status ── {statusLabel(status)}</span>
        <span>{statusMeta(status, elapsed)}</span>
      </footer>

      {libraryChars.length > 0 && (
        <section className="mt-10 border-t border-hairline pt-7">
          <div className="mb-4 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
            <span className="text-mute">
              Library ── {libraryChars.length} glyph
              {libraryChars.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear the whole library?')) setLibrary({});
              }}
              className="text-mute transition-colors hover:text-ink"
            >
              clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {libraryChars.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => selectFromLibrary(ch)}
                className="group flex h-16 w-16 flex-col items-center justify-center rounded border border-hairline transition-colors hover:border-ink"
                title={`${ch} · "${library[ch].vibe}"`}
              >
                <div
                  className="glyf-tile h-11 w-11 [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: library[ch].svg }}
                />
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-mute group-hover:text-ink">
                  {ch === ' ' ? '␣' : ch}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {libraryChars.length > 0 && (
        <section className="mt-8 border-t border-hairline pt-7">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
            Preview ──
          </span>
          <div
            className="mt-3 min-h-[5rem] break-words text-6xl leading-tight"
            style={{
              fontFamily: 'GlyfPreview, system-ui, sans-serif',
            }}
          >
            {typeText || (
              <span className="font-serif italic text-[15px] text-mute">
                type below to preview
              </span>
            )}
          </div>
          <textarea
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            rows={2}
            placeholder="The quick brown fox..."
            className="mt-4 w-full border-0 border-b border-hairline bg-transparent pb-2 font-mono text-sm placeholder:text-mute focus:border-ink focus:outline-none"
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

function Specimen({
  svg,
  isStreaming,
  idle,
  anchorsVisible,
  selectedAnchors,
  onSelectionChange,
  onPathChange,
  zoom,
  onZoomChange,
  pan,
  onPanChange,
}: {
  svg: string;
  isStreaming: boolean;
  idle: boolean;
  anchorsVisible: boolean;
  selectedAnchors: ReadonlySet<number>;
  onSelectionChange: (ids: ReadonlySet<number>) => void;
  onPathChange: (svg: string, final: boolean) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.005;
      const next = Math.max(1, Math.min(5, +(zoom + delta).toFixed(2)));
      onZoomChange(next);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, onZoomChange]);
  return (
    <div>
      <div className="relative mb-2 mr-16 h-3">
        {V_TICKS.map((t) => (
          <span
            key={t}
            className="absolute font-mono text-[9px] text-mute"
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
          className="relative aspect-square flex-1 overflow-hidden border border-hairline"
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
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
              isStreaming ? ' is-streaming' : ''
            }`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <PathEditor
            svg={svg}
            onChange={onPathChange}
            disabled={isStreaming || idle || !anchorsVisible}
            selectedIds={selectedAnchors}
            onSelectionChange={onSelectionChange}
            zoom={zoom}
            pan={pan}
            onPanChange={onPanChange}
          />
          </div>
          {idle && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-serif italic text-mute">
              awaiting input.
            </div>
          )}
        </div>
        <div className="relative w-14">
          {GUIDES.map((g) => (
            <div
              key={g.label}
              className="absolute flex w-full items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.1em]"
              style={{
                top: `${(g.y / 1000) * 100}%`,
                transform: 'translateY(-50%)',
              }}
            >
              <span className="text-ink">{g.label}</span>
              <span className="text-mute">{g.y}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
