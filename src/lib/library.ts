export type LibraryItem = {
  letter: string;
  svg: string;
  vibe: string;
  createdAt: number;
};

export type Library = Record<string, LibraryItem>;

const STORAGE_KEY = 'glyf-library';

export function loadLibrary(): Library {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Library;
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    return {};
  }
}

export function saveLibrary(library: Library): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch {
    // quota exceeded or storage disabled — ignore
  }
}

export const BATCH_SET = (
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789' +
  '.,!?:;-\'"'
).split('');
