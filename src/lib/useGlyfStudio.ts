'use client';

import { useEffect, useState } from 'react';
import { centerSvg } from '@/lib/center';
import { BATCH_SET, loadLibrary, saveLibrary, type Library } from '@/lib/library';
import { libraryToTtf } from '@/lib/font';
import {
  extractD,
  fitLetter,
  getHandles,
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

export type Status =
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

export function useGlyfStudio(opts?: { anchorsVisibleDefault?: boolean }) {
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
  const [anchorsVisible, setAnchorsVisible] = useState(
    opts?.anchorsVisibleDefault ?? true,
  );
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
    setAnchorsVisible(true);
    const d = extractD(item.svg);
    if (d) {
      const handles = getHandles(parsePath(d));
      const all = new Set<number>();
      handles.forEach((h, i) => {
        if (h.kind === 'anchor') all.add(i);
      });
      setSelectedAnchors(all);
    }
  }

  function handlePathChange(newSvg: string, final: boolean) {
    if (final && letter && library[letter] && library[letter].svg !== newSvg) {
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
    setEditHistory((h) => ({ ...h, [letter]: stack.slice(0, -1) }));
    setRedoHistory((h) => ({
      ...h,
      [letter]: [...(h[letter] ?? []), currentSvg].slice(-50),
    }));
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
    setRedoHistory((h) => ({ ...h, [letter]: stack.slice(0, -1) }));
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const isUndo =
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
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
  const libraryChars = Object.keys(library).sort((a, b) => a.localeCompare(b));
  const hasGlyph = Boolean(letter && library[letter]);
  const canFit =
    hasGlyph && /[A-Za-z]/.test(letter) && !/[gjpqy]/.test(letter);

  return {
    vibe, setVibe, letter, setLetter, batchMode, setBatchMode,
    svg, status, elapsed, library, setLibrary, typeText, setTypeText,
    editHistory, redoHistory, anchorsVisible, setAnchorsVisible,
    selectedAnchors, setSelectedAnchors, zoom, setZoom, pan, setPan,
    handleGenerate, selectFromLibrary, handlePathChange, undo, redo,
    handleFit, handleClean, handleSoftenSelection,
    isStreaming, idle, canDownload, libraryChars, hasGlyph, canFit,
  };
}
