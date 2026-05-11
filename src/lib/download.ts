import { libraryToTtf } from './font';
import type { Library } from './library';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, letter: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  downloadBlob(blob, `glyf-${letter.toLowerCase() || 'glyph'}.svg`);
}

export function downloadFont(library: Library) {
  const buf = libraryToTtf(library);
  const blob = new Blob([buf], { type: 'font/ttf' });
  const count = Object.keys(library).length;
  const name = count === 1 ? `glyf-${Object.keys(library)[0].toLowerCase()}` : 'glyf';
  downloadBlob(blob, `${name}.ttf`);
}
