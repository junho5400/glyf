'use client';

import { useEffect, useState } from 'react';
import { centerSvg } from '@/lib/center';
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
        } catch {
          // skip malformed event
        }
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
  | { kind: 'generating'; startedAt: number }
  | { kind: 'complete'; durationMs: number; chars: number; commands: number }
  | { kind: 'error'; message: string };

export default function Home() {
  const [vibe, setVibe] = useState('');
  const [letter, setLetter] = useState('');
  const [svg, setSvg] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status.kind !== 'generating') return;
    const startedAt = status.startedAt;
    const interval = setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 50);
    return () => clearInterval(interval);
  }, [status]);

  async function handleGenerate() {
    if (!vibe || !letter) return;
    const startedAt = Date.now();
    setStatus({ kind: 'generating', startedAt });
    setSvg('');
    setElapsed(0);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vibe, letter }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      let buf = '';
      for await (const event of readSse(res.body)) {
        const e = event as { text?: string; done?: boolean };
        if (e.done) break;
        if (typeof e.text !== 'string') continue;
        buf += e.text;
        setSvg(centerSvg(sanitizeSvg(buf)));
      }
      const durationMs = Date.now() - startedAt;
      const dMatch = buf.match(/d="([^"]*)"/);
      const d = dMatch ? dMatch[1] : '';
      const commands = (d.match(/[MLQCSTHVAZmlqctshvaz]/g) || []).length;
      setStatus({ kind: 'complete', durationMs, chars: buf.length, commands });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  const isStreaming = status.kind === 'generating';
  const idle = status.kind === 'idle' && !svg;

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
              <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
                Vibe ──
              </span>
              <input
                type="text"
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                className="w-full border-0 border-b border-hairline bg-transparent pb-1 font-mono text-sm focus:border-ink focus:outline-none"
              />
            </div>
            <div className="ml-20 mt-2 font-serif italic text-[13px] leading-[1.55] text-mute">
              {EXAMPLES.map((ex, i) => (
                <span key={ex}>
                  {i > 0 && <span className="mx-1.5">·</span>}
                  <button
                    type="button"
                    onClick={() => setVibe(ex)}
                    className="transition-colors hover:text-ink"
                  >
                    “{ex}”
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-baseline gap-4">
            <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
              Letter ──
            </span>
            <input
              type="text"
              value={letter}
              onChange={(e) =>
                setLetter(e.target.value.slice(0, 1).toUpperCase())
              }
              maxLength={1}
              className="w-14 border-0 border-b border-hairline bg-transparent pb-1 text-center font-mono text-2xl focus:border-ink focus:outline-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!vibe || !letter || isStreaming}
              className="font-mono text-[12px] uppercase tracking-[0.18em] transition-colors hover:text-mute disabled:cursor-not-allowed disabled:text-mute"
            >
              [ generate ]
            </button>
          </div>
        </div>

        <Specimen svg={svg} isStreaming={isStreaming} idle={idle} />
      </section>

      <footer className="flex items-center justify-between pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
        <span>Status ── {statusLabel(status)}</span>
        <span>{statusMeta(status, elapsed)}</span>
      </footer>
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
      return `T+ ${elapsed.toFixed(2)} s`;
    case 'complete':
      return `${(status.durationMs / 1000).toFixed(2)} s · ${status.chars} ch · ${status.commands} cmd`;
    case 'error':
      return status.message;
  }
}

function Specimen({
  svg,
  isStreaming,
  idle,
}: {
  svg: string;
  isStreaming: boolean;
  idle: boolean;
}) {
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
        <div className="relative aspect-square flex-1 overflow-hidden border border-hairline">
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
