'use client';

import { useState } from 'react';
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

export default function Home() {
  const [vibe, setVibe] = useState('');
  const [letter, setLetter] = useState('');
  const [svg, setSvg] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  async function handleGenerate() {
    setIsStreaming(true);
    setSvg('');
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
        setSvg(sanitizeSvg(buf));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  }

  const showPlaceholder = !svg && !isStreaming;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Glyf</h1>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Vibe</span>
        <textarea
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          rows={3}
          placeholder="art deco, gold leaf, geometric"
          className="rounded border border-zinc-300 p-2 dark:border-zinc-700"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Letter</span>
        <input
          value={letter}
          onChange={(e) => setLetter(e.target.value.slice(0, 1).toUpperCase())}
          maxLength={1}
          placeholder="A"
          className="w-16 rounded border border-zinc-300 p-2 text-center text-lg dark:border-zinc-700"
        />
      </label>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!vibe || !letter || isStreaming}
        className="rounded border border-zinc-300 p-2 disabled:opacity-50 dark:border-zinc-700"
      >
        {isStreaming ? 'Generating…' : 'Generate'}
      </button>

      {showPlaceholder ? (
        <div className="flex aspect-square w-full items-center justify-center rounded border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
          SVG will render here
        </div>
      ) : (
        <div
          className={`glyf-svg aspect-square w-full rounded border border-zinc-300 dark:border-zinc-700 [&_svg]:h-full [&_svg]:w-full${
            isStreaming ? ' is-streaming' : ''
          }`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </main>
  );
}
