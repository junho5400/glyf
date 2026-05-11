const SELF_CLOSING = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polygon',
  'polyline',
  'use',
  'image',
  'stop',
]);

const SVG_OPEN_RE = /<svg\b[^>]*>/;

export function sanitizeSvg(buf: string): string {
  const openMatch = SVG_OPEN_RE.exec(buf);
  if (!openMatch) return '';
  const svgOpen = openMatch[0];
  let rest = buf.slice(openMatch.index + svgOpen.length);
  const closeIdx = rest.indexOf('</svg>');
  if (closeIdx >= 0) rest = rest.slice(0, closeIdx);
  return svgOpen + sanitizeInner(rest) + '</svg>';
}

function sanitizeInner(inner: string): string {
  let out = '';
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /\s/.test(inner[i])) {
      out += inner[i];
      i++;
    }
    if (i >= inner.length) break;
    if (inner[i] !== '<') break;
    const end = findTagEnd(inner, i);
    if (end === -1) {
      out += closeIncompleteTag(inner.slice(i));
      break;
    }
    out += inner.slice(i, end);
    i = end;
  }
  return out;
}

function findTagEnd(text: string, start: number): number {
  let i = start + 1;
  let inString: '"' | "'" | null = null;
  while (i < text.length) {
    const c = text[i];
    if (inString) {
      if (c === inString) inString = null;
    } else if (c === '"' || c === "'") {
      inString = c;
    } else if (c === '>') {
      return i + 1;
    }
    i++;
  }
  return -1;
}

function closeIncompleteTag(partial: string): string {
  const nameMatch = /^<\s*([a-zA-Z][\w-]*)/.exec(partial);
  if (!nameMatch) return '';
  const tagName = nameMatch[1].toLowerCase();
  if (!SELF_CLOSING.has(tagName)) return '';
  let inString: '"' | "'" | null = null;
  for (let i = 1; i < partial.length; i++) {
    const c = partial[i];
    if (inString) {
      if (c === inString) inString = null;
    } else if (c === '"' || c === "'") {
      inString = c;
    }
  }
  let result = partial;
  if (inString && tagName === 'path') {
    // Inside an unclosed d="...". Trim a trailing partial number so the
    // pen doesn't jump when the next chunk extends a digit (e.g. 21 → 213).
    result = result.replace(/[0-9.]+$/, '');
  }
  if (inString) result += inString;
  result = result.replace(/[\s/]+$/, '');
  result += '/>';
  return result;
}
