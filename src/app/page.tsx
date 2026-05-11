'use client';

import { useState } from 'react';

export default function Home() {
  const [vibe, setVibe] = useState('');
  const [letter, setLetter] = useState('');
  const [svg, setSvg] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    setSvg('');
    console.log('generate', { vibe, letter });
    setIsGenerating(false);
  }

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
        disabled={!vibe || !letter || isGenerating}
        className="rounded border border-zinc-300 p-2 disabled:opacity-50 dark:border-zinc-700"
      >
        {isGenerating ? 'Generating…' : 'Generate'}
      </button>

      {svg ? (
        <div
          className="aspect-square w-full rounded border border-zinc-300 dark:border-zinc-700"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
          SVG will render here
        </div>
      )}
    </main>
  );
}
