const PARAM_COUNT: Record<string, number> = {
  m: 2, l: 2, t: 2,
  h: 1, v: 1,
  c: 6, s: 4, q: 4,
  a: 7, z: 0,
};

const TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g;

export type Bbox = { minX: number; maxX: number; minY: number; maxY: number };

export function pathBbox(d: string): Bbox | null {
  const tokens = d.match(TOKEN_RE);
  if (!tokens?.length) return null;

  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const record = (px: number, py: number) => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
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
        record(x, y);
        if (cmd === 'M') cmd = 'L';
        else cmd = 'l';
        break;
      }
      case 'l':
      case 't': {
        x = abs ? a[0] : x + a[0];
        y = abs ? a[1] : y + a[1];
        record(x, y);
        break;
      }
      case 'h': {
        x = abs ? a[0] : x + a[0];
        record(x, y);
        break;
      }
      case 'v': {
        y = abs ? a[0] : y + a[0];
        record(x, y);
        break;
      }
      case 'q':
      case 's': {
        record(abs ? a[0] : x + a[0], abs ? a[1] : y + a[1]);
        const nx = abs ? a[2] : x + a[2];
        const ny = abs ? a[3] : y + a[3];
        record(nx, ny);
        x = nx;
        y = ny;
        break;
      }
      case 'c': {
        record(abs ? a[0] : x + a[0], abs ? a[1] : y + a[1]);
        record(abs ? a[2] : x + a[2], abs ? a[3] : y + a[3]);
        const nx = abs ? a[4] : x + a[4];
        const ny = abs ? a[5] : y + a[5];
        record(nx, ny);
        x = nx;
        y = ny;
        break;
      }
      case 'a': {
        const nx = abs ? a[5] : x + a[5];
        const ny = abs ? a[6] : y + a[6];
        record(nx, ny);
        x = nx;
        y = ny;
        break;
      }
    }
    i += need;
  }

  if (minX === Infinity) return null;
  return { minX, maxX, minY, maxY };
}

const VIEWBOX_CENTER_X = 500;

export function centerSvg(svgString: string): string {
  const dMatch = /<path[^>]*\bd="([^"]+)"/.exec(svgString);
  if (!dMatch) return svgString;
  const bbox = pathBbox(dMatch[1]);
  if (!bbox || bbox.maxX === bbox.minX) return svgString;
  const shift = VIEWBOX_CENTER_X - (bbox.minX + bbox.maxX) / 2;
  return svgString.replace(
    /<path([^>]*?)(\s*\/?>)/,
    `<path$1 transform="translate(${shift} 0)"$2`,
  );
}
