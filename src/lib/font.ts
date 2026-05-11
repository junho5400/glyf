import { Font, Glyph, Path } from 'opentype.js';
import { pathBbox } from './center';
import type { Library } from './library';

const PARAM_COUNT: Record<string, number> = {
  m: 2, l: 2, t: 2,
  h: 1, v: 1,
  c: 6, s: 4, q: 4,
  a: 7, z: 0,
};

const TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g;

const BASELINE_SVG_Y = 750;

function buildPath(d: string, xOffset: number, baselineY: number): Path {
  const tokens = d.match(TOKEN_RE) ?? [];
  const path = new Path();
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;

  const tx = (v: number) => v + xOffset;
  const ty = (v: number) => baselineY - v;

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        path.close();
        x = sx;
        y = sy;
      }
      continue;
    }

    const lower = cmd.toLowerCase();
    const abs = cmd === cmd.toUpperCase();
    const need = PARAM_COUNT[lower] ?? 0;
    if (need === 0 || i + need > tokens.length) {
      i++;
      continue;
    }
    const a = tokens.slice(i, i + need).map(parseFloat);
    if (a.some(Number.isNaN)) {
      i += need;
      continue;
    }

    switch (lower) {
      case 'm': {
        x = abs ? a[0] : x + a[0];
        y = abs ? a[1] : y + a[1];
        sx = x;
        sy = y;
        path.moveTo(tx(x), ty(y));
        cmd = abs ? 'L' : 'l';
        break;
      }
      case 'l':
      case 't': {
        x = abs ? a[0] : x + a[0];
        y = abs ? a[1] : y + a[1];
        path.lineTo(tx(x), ty(y));
        break;
      }
      case 'h': {
        x = abs ? a[0] : x + a[0];
        path.lineTo(tx(x), ty(y));
        break;
      }
      case 'v': {
        y = abs ? a[0] : y + a[0];
        path.lineTo(tx(x), ty(y));
        break;
      }
      case 'q': {
        const c1x = abs ? a[0] : x + a[0];
        const c1y = abs ? a[1] : y + a[1];
        const ex = abs ? a[2] : x + a[2];
        const ey = abs ? a[3] : y + a[3];
        path.quadraticCurveTo(tx(c1x), ty(c1y), tx(ex), ty(ey));
        x = ex;
        y = ey;
        break;
      }
      case 'c': {
        const c1x = abs ? a[0] : x + a[0];
        const c1y = abs ? a[1] : y + a[1];
        const c2x = abs ? a[2] : x + a[2];
        const c2y = abs ? a[3] : y + a[3];
        const ex = abs ? a[4] : x + a[4];
        const ey = abs ? a[5] : y + a[5];
        path.bezierCurveTo(tx(c1x), ty(c1y), tx(c2x), ty(c2y), tx(ex), ty(ey));
        x = ex;
        y = ey;
        break;
      }
      default: {
        i += need;
        continue;
      }
    }
    i += need;
  }

  return path;
}

type Built = {
  glyph: Glyph;
  ascender: number;
  descender: number;
};

function buildGlyph(svg: string, letter: string): Built | null {
  const dMatch = svg.match(/<path[^>]*\bd="([^"]+)"/);
  if (!dMatch) return null;
  const d = dMatch[1];
  const bbox = pathBbox(d);
  if (!bbox) return null;

  const ascender = Math.round(BASELINE_SVG_Y - bbox.minY);
  const descender = Math.min(0, Math.round(BASELINE_SVG_Y - bbox.maxY));
  const advanceWidth = Math.round(bbox.maxX - bbox.minX);
  if (advanceWidth === 0) return null;

  const path = buildPath(d, -bbox.minX, BASELINE_SVG_Y);
  const codePoint = letter.codePointAt(0) ?? 0;
  if (codePoint === 0) return null;

  const glyph = new Glyph({
    name: letter,
    unicode: codePoint,
    advanceWidth,
    path,
  });
  return { glyph, ascender, descender };
}

export function libraryToTtf(library: Library): ArrayBuffer {
  const built: Built[] = [];
  for (const item of Object.values(library)) {
    const b = buildGlyph(item.svg, item.letter);
    if (b) built.push(b);
  }
  if (built.length === 0) throw new Error('Empty library');

  const maxAscender = Math.max(...built.map((b) => b.ascender));
  const minDescender = Math.min(...built.map((b) => b.descender));
  const unitsPerEm = maxAscender - minDescender;

  const notdef = new Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: Math.round(unitsPerEm * 0.5),
    path: new Path(),
  });

  const glyphs = [notdef, ...built.map((b) => b.glyph)];

  const font = new Font({
    familyName: 'Glyf',
    styleName: 'Regular',
    unitsPerEm,
    ascender: maxAscender,
    descender: minDescender,
    glyphs,
  });

  return font.toArrayBuffer();
}
