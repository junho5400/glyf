import { pathBbox } from './center';

export type PathOp = { cmd: string; params: number[] };

export type Anchor = {
  opIdx: number;
  x: number;
  y: number;
};

export type Handle = {
  opIdx: number;
  paramIdx: number;
  axis: 'xy' | 'x' | 'y';
  x: number;
  y: number;
  kind: 'anchor' | 'control';
  links?: Array<{ x: number; y: number }>;
};

const PARAM_COUNT: Record<string, number> = {
  m: 2, l: 2, t: 2,
  h: 1, v: 1,
  c: 6, s: 4, q: 4,
  a: 7, z: 0,
};

const TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g;

export function parsePath(d: string): PathOp[] {
  const tokens = d.match(TOKEN_RE) ?? [];
  const ops: PathOp[] = [];
  let cmd = '';
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        ops.push({ cmd, params: [] });
      }
      continue;
    }
    const need = PARAM_COUNT[cmd.toLowerCase()] ?? 0;
    if (need === 0) {
      i++;
      continue;
    }
    if (i + need > tokens.length) break;
    const params = tokens.slice(i, i + need).map(parseFloat);
    if (params.some(Number.isNaN)) {
      i += need;
      continue;
    }
    ops.push({ cmd, params });
    i += need;
    if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
  }
  return ops;
}

export function serializePath(ops: PathOp[]): string {
  return ops
    .map((op) => (op.params.length === 0 ? op.cmd : `${op.cmd}${op.params.join(' ')}`))
    .join('');
}

export function getAnchors(ops: PathOp[]): Anchor[] {
  const anchors: Anchor[] = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const lower = op.cmd.toLowerCase();
    const abs = op.cmd === op.cmd.toUpperCase();
    switch (lower) {
      case 'm':
      case 'l':
      case 't': {
        curX = abs ? op.params[0] : curX + op.params[0];
        curY = abs ? op.params[1] : curY + op.params[1];
        if (lower === 'm') {
          startX = curX;
          startY = curY;
        }
        anchors.push({ opIdx: i, x: curX, y: curY });
        break;
      }
      case 'h': {
        curX = abs ? op.params[0] : curX + op.params[0];
        anchors.push({ opIdx: i, x: curX, y: curY });
        break;
      }
      case 'v': {
        curY = abs ? op.params[0] : curY + op.params[0];
        anchors.push({ opIdx: i, x: curX, y: curY });
        break;
      }
      case 'q':
      case 's': {
        curX = abs ? op.params[2] : curX + op.params[2];
        curY = abs ? op.params[3] : curY + op.params[3];
        anchors.push({ opIdx: i, x: curX, y: curY });
        break;
      }
      case 'c': {
        curX = abs ? op.params[4] : curX + op.params[4];
        curY = abs ? op.params[5] : curY + op.params[5];
        anchors.push({ opIdx: i, x: curX, y: curY });
        break;
      }
      case 'z': {
        curX = startX;
        curY = startY;
        break;
      }
    }
  }
  return anchors;
}

export function setAnchor(
  ops: PathOp[],
  anchorIdx: number,
  newX: number,
  newY: number,
): PathOp[] {
  const anchors = getAnchors(ops);
  const target = anchors[anchorIdx];
  if (!target) return ops;
  const op = ops[target.opIdx];
  const lower = op.cmd.toLowerCase();
  const abs = op.cmd === op.cmd.toUpperCase();
  if (!abs) return ops; // skip relative ops for v1
  const newOps = ops.map((o, i) =>
    i === target.opIdx ? { ...o, params: [...o.params] } : o,
  );
  const t = newOps[target.opIdx];
  switch (lower) {
    case 'm':
    case 'l':
    case 't':
      t.params[0] = newX;
      t.params[1] = newY;
      break;
    case 'h':
      t.params[0] = newX;
      break;
    case 'v':
      t.params[0] = newY;
      break;
    case 'q':
    case 's':
      t.params[2] = newX;
      t.params[3] = newY;
      break;
    case 'c':
      t.params[4] = newX;
      t.params[5] = newY;
      break;
  }
  return newOps;
}

export function getHandles(ops: PathOp[]): Handle[] {
  const handles: Handle[] = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let prevAnchor: { x: number; y: number } | null = null;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const lower = op.cmd.toLowerCase();
    const abs = op.cmd === op.cmd.toUpperCase();
    if (!abs) continue; // skip relative for v1

    switch (lower) {
      case 'm':
      case 'l':
      case 't': {
        const x = op.params[0];
        const y = op.params[1];
        handles.push({
          opIdx: i,
          paramIdx: 0,
          axis: 'xy',
          x,
          y,
          kind: 'anchor',
        });
        if (lower === 'm') {
          startX = x;
          startY = y;
        }
        prevAnchor = { x, y };
        curX = x;
        curY = y;
        break;
      }
      case 'h': {
        const x = op.params[0];
        handles.push({
          opIdx: i,
          paramIdx: 0,
          axis: 'x',
          x,
          y: curY,
          kind: 'anchor',
        });
        prevAnchor = { x, y: curY };
        curX = x;
        break;
      }
      case 'v': {
        const y = op.params[0];
        handles.push({
          opIdx: i,
          paramIdx: 0,
          axis: 'y',
          x: curX,
          y,
          kind: 'anchor',
        });
        prevAnchor = { x: curX, y };
        curY = y;
        break;
      }
      case 'q': {
        const cx = op.params[0];
        const cy = op.params[1];
        const ex = op.params[2];
        const ey = op.params[3];
        const links: Array<{ x: number; y: number }> = [];
        if (prevAnchor) links.push(prevAnchor);
        links.push({ x: ex, y: ey });
        handles.push({
          opIdx: i,
          paramIdx: 0,
          axis: 'xy',
          x: cx,
          y: cy,
          kind: 'control',
          links,
        });
        handles.push({
          opIdx: i,
          paramIdx: 2,
          axis: 'xy',
          x: ex,
          y: ey,
          kind: 'anchor',
        });
        prevAnchor = { x: ex, y: ey };
        curX = ex;
        curY = ey;
        break;
      }
      case 's': {
        const cx = op.params[0];
        const cy = op.params[1];
        const ex = op.params[2];
        const ey = op.params[3];
        handles.push({
          opIdx: i,
          paramIdx: 0,
          axis: 'xy',
          x: cx,
          y: cy,
          kind: 'control',
          links: [{ x: ex, y: ey }],
        });
        handles.push({
          opIdx: i,
          paramIdx: 2,
          axis: 'xy',
          x: ex,
          y: ey,
          kind: 'anchor',
        });
        prevAnchor = { x: ex, y: ey };
        curX = ex;
        curY = ey;
        break;
      }
      case 'c': {
        const c1x = op.params[0];
        const c1y = op.params[1];
        const c2x = op.params[2];
        const c2y = op.params[3];
        const ex = op.params[4];
        const ey = op.params[5];
        handles.push({
          opIdx: i,
          paramIdx: 0,
          axis: 'xy',
          x: c1x,
          y: c1y,
          kind: 'control',
          links: prevAnchor ? [prevAnchor] : [],
        });
        handles.push({
          opIdx: i,
          paramIdx: 2,
          axis: 'xy',
          x: c2x,
          y: c2y,
          kind: 'control',
          links: [{ x: ex, y: ey }],
        });
        handles.push({
          opIdx: i,
          paramIdx: 4,
          axis: 'xy',
          x: ex,
          y: ey,
          kind: 'anchor',
        });
        prevAnchor = { x: ex, y: ey };
        curX = ex;
        curY = ey;
        break;
      }
      case 'a': {
        const ex = op.params[5];
        const ey = op.params[6];
        handles.push({
          opIdx: i,
          paramIdx: 5,
          axis: 'xy',
          x: ex,
          y: ey,
          kind: 'anchor',
        });
        prevAnchor = { x: ex, y: ey };
        curX = ex;
        curY = ey;
        break;
      }
      case 'z': {
        curX = startX;
        curY = startY;
        prevAnchor = { x: startX, y: startY };
        break;
      }
    }
  }
  return handles;
}

export function setHandle(
  ops: PathOp[],
  handleIdx: number,
  newX: number,
  newY: number,
): PathOp[] {
  const handles = getHandles(ops);
  const handle = handles[handleIdx];
  if (!handle) return ops;
  const newOps = ops.map((o, i) =>
    i === handle.opIdx ? { ...o, params: [...o.params] } : o,
  );
  const t = newOps[handle.opIdx];
  if (handle.axis === 'xy') {
    t.params[handle.paramIdx] = newX;
    t.params[handle.paramIdx + 1] = newY;
  } else if (handle.axis === 'x') {
    t.params[handle.paramIdx] = newX;
  } else if (handle.axis === 'y') {
    t.params[handle.paramIdx] = newY;
  }
  return newOps;
}

function transformDCoords(
  d: string,
  scale: number,
  tx: number,
  ty: number,
): string {
  const ops = parsePath(d);
  const newOps = ops.map((op) => {
    const lower = op.cmd.toLowerCase();
    const abs = op.cmd === op.cmd.toUpperCase();
    if (lower === 'z') return op;
    const p = op.params.slice();
    const applyXY = (i: number) => {
      if (abs) {
        p[i] = p[i] * scale + tx;
        p[i + 1] = p[i + 1] * scale + ty;
      } else {
        p[i] = p[i] * scale;
        p[i + 1] = p[i + 1] * scale;
      }
    };
    switch (lower) {
      case 'm':
      case 'l':
      case 't':
        applyXY(0);
        break;
      case 'h':
        p[0] = abs ? p[0] * scale + tx : p[0] * scale;
        break;
      case 'v':
        p[0] = abs ? p[0] * scale + ty : p[0] * scale;
        break;
      case 'q':
      case 's':
        applyXY(0);
        applyXY(2);
        break;
      case 'c':
        applyXY(0);
        applyXY(2);
        applyXY(4);
        break;
      case 'a':
        p[0] = p[0] * scale;
        p[1] = p[1] * scale;
        if (abs) {
          p[5] = p[5] * scale + tx;
          p[6] = p[6] * scale + ty;
        } else {
          p[5] = p[5] * scale;
          p[6] = p[6] * scale;
        }
        break;
    }
    return { ...op, params: p };
  });
  return serializePath(newOps);
}

function getTargetYRange(letter: string): { yMin: number; yMax: number } | null {
  if (!letter) return null;
  const c = letter[0];
  if (/[A-Z]/.test(c)) return { yMin: 265, yMax: 750 };
  return null;
}

export function fitLetter(svg: string, letter: string): string {
  const d = extractD(svg);
  if (!d) return svg;
  const bbox = pathBbox(d);
  if (!bbox) return svg;
  const target = getTargetYRange(letter);
  if (!target) return svg;

  const currentH = bbox.maxY - bbox.minY;
  const currentW = bbox.maxX - bbox.minX;
  if (currentH === 0 || currentW === 0) return svg;

  const targetH = target.yMax - target.yMin;
  const scale = targetH / currentH;
  const scaledW = currentW * scale;
  const targetXMin = (1000 - scaledW) / 2;
  const tx = targetXMin - bbox.minX * scale;
  const ty = target.yMin - bbox.minY * scale;

  const newD = transformDCoords(d, scale, tx, ty);
  let result = replaceD(svg, newD);
  result = result.replace(/\s*transform="[^"]*"/, '');
  return result;
}

// Symmetric C¹ soften at each selected anchor: nudge both incoming and outgoing
// Q controls toward an aligned arrangement around the anchor. Movement per
// control is capped so the form stays close to the original.
export function softenAnchors(
  ops: PathOp[],
  selectedHandleIds: ReadonlySet<number>,
  alpha = 0.6,
  maxMove = 30,
): PathOp[] {
  if (selectedHandleIds.size === 0) return ops;
  const handles = getHandles(ops);
  if (handles.length === 0) return ops;

  const targets = new Map<number, { x: number; y: number }>();

  for (const id of selectedHandleIds) {
    const h = handles[id];
    if (!h || h.kind !== 'anchor') continue;
    const prevC = handles[id - 1];
    const nextC = handles[id + 1];
    if (!prevC || prevC.kind !== 'control') continue;
    if (!nextC || nextC.kind !== 'control') continue;

    const inDx = h.x - prevC.x;
    const inDy = h.y - prevC.y;
    const inLen = Math.hypot(inDx, inDy);
    const outDx = nextC.x - h.x;
    const outDy = nextC.y - h.y;
    const outLen = Math.hypot(outDx, outDy);
    if (inLen === 0 || outLen === 0) continue;

    const tX = inDx / inLen + outDx / outLen;
    const tY = inDy / inLen + outDy / outLen;
    const tLen = Math.hypot(tX, tY);
    if (tLen === 0) continue;
    const tnX = tX / tLen;
    const tnY = tY / tLen;

    const newCinX = h.x - tnX * inLen;
    const newCinY = h.y - tnY * inLen;
    const newCoutX = h.x + tnX * outLen;
    const newCoutY = h.y + tnY * outLen;

    const blend = (
      curr: { x: number; y: number },
      tgt: { x: number; y: number },
    ) => {
      const bx = curr.x * (1 - alpha) + tgt.x * alpha;
      const by = curr.y * (1 - alpha) + tgt.y * alpha;
      const dx = bx - curr.x;
      const dy = by - curr.y;
      const d = Math.hypot(dx, dy);
      const f = d > maxMove ? maxMove / d : 1;
      return { x: curr.x + dx * f, y: curr.y + dy * f };
    };

    targets.set(id - 1, blend(prevC, { x: newCinX, y: newCinY }));
    targets.set(id + 1, blend(nextC, { x: newCoutX, y: newCoutY }));
  }

  let result = ops;
  for (const [hId, pos] of targets) {
    const h = handles[hId];
    if (!h) continue;
    result = result.map((o, i) => {
      if (i !== h.opIdx) return o;
      const newParams = [...o.params];
      if (h.axis === 'xy') {
        newParams[h.paramIdx] = pos.x;
        newParams[h.paramIdx + 1] = pos.y;
      } else if (h.axis === 'x') {
        newParams[h.paramIdx] = pos.x;
      } else if (h.axis === 'y') {
        newParams[h.paramIdx] = pos.y;
      }
      return { ...o, params: newParams };
    });
  }
  return result;
}

// Apply a translate + per-axis scale + rotation (around a pivot, in d-coord
// space) to a set of selected handles. Scale/translate/rotate are composed in
// the order: scale → rotate → translate.
export function transformHandles(
  ops: PathOp[],
  selectedHandleIds: ReadonlySet<number>,
  dx: number,
  dy: number,
  scaleX: number,
  scaleY: number,
  pivotX: number,
  pivotY: number,
  rotation = 0,
): PathOp[] {
  if (selectedHandleIds.size === 0) return ops;
  const original = getHandles(ops);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let result = ops;
  for (const id of selectedHandleIds) {
    const h = original[id];
    if (!h) continue;
    const ox = h.x - pivotX;
    const oy = h.y - pivotY;
    const sx = ox * scaleX;
    const sy = oy * scaleY;
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    const newX = pivotX + rx + dx;
    const newY = pivotY + ry + dy;
    result = setHandle(result, id, newX, newY);
  }
  return result;
}

// RDP-style anchor simplification. Removes interior anchors whose perpendicular
// distance to the line through their two neighbors is below `threshold`. Sharp
// corners (large perp distance) are preserved. Runs multiple passes so freshly-
// adjacent anchors get a chance to be re-evaluated each click.
export function simplifyPath(d: string, threshold = 5): string {
  let current = d;
  for (let i = 0; i < 6; i++) {
    const next = simplifyPathPass(current, threshold);
    if (next === current) break;
    current = next;
  }
  return current;
}

function perpDist(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return (
    Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
  );
}

function simplifyPathPass(d: string, threshold: number): string {
  const ops = parsePath(d);
  if (ops.length < 4) return d;

  const anchorOf: Array<{ x: number; y: number } | null> = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  for (const op of ops) {
    const lower = op.cmd.toLowerCase();
    const abs = op.cmd === op.cmd.toUpperCase();
    if (lower === 'z') {
      anchorOf.push(null);
      curX = startX;
      curY = startY;
      continue;
    }
    if (!abs) {
      anchorOf.push(null);
      continue;
    }
    let endX = curX;
    let endY = curY;
    switch (lower) {
      case 'm':
      case 'l':
      case 't':
        endX = op.params[0];
        endY = op.params[1];
        if (lower === 'm') {
          startX = endX;
          startY = endY;
        }
        break;
      case 'h':
        endX = op.params[0];
        break;
      case 'v':
        endY = op.params[0];
        break;
      case 'q':
      case 's':
        endX = op.params[2];
        endY = op.params[3];
        break;
      case 'c':
        endX = op.params[4];
        endY = op.params[5];
        break;
      case 'a':
        endX = op.params[5];
        endY = op.params[6];
        break;
      default:
        anchorOf.push(null);
        continue;
    }
    anchorOf.push({ x: endX, y: endY });
    curX = endX;
    curY = endY;
  }

  const anchorIndices: number[] = [];
  for (let i = 0; i < anchorOf.length; i++) {
    if (anchorOf[i]) anchorIndices.push(i);
  }
  if (anchorIndices.length < 3) return d;

  const toRemove = new Set<number>();
  for (let k = 1; k < anchorIndices.length - 1; k++) {
    const prevIdx = anchorIndices[k - 1];
    const currIdx = anchorIndices[k];
    const nextIdx = anchorIndices[k + 1];
    // Don't remove an M (subpath start) anchor.
    if (ops[currIdx].cmd.toLowerCase() === 'm') continue;
    // Don't collapse adjacent removals in the same pass.
    if (toRemove.has(prevIdx) || toRemove.has(nextIdx)) continue;
    const dist = perpDist(
      anchorOf[currIdx]!,
      anchorOf[prevIdx]!,
      anchorOf[nextIdx]!,
    );
    if (dist < threshold) toRemove.add(currIdx);
  }

  if (toRemove.size === 0) return d;
  const result = ops.filter((_, i) => !toRemove.has(i));
  return serializePath(result);
}

export function removeOp(ops: PathOp[], handleIdx: number): PathOp[] | null {
  const handles = getHandles(ops);
  const handle = handles[handleIdx];
  if (!handle) return null;
  if (handle.kind !== 'anchor') return null;
  const op = ops[handle.opIdx];
  if (!op) return null;
  // Don't allow removing the first M — it's the subpath start
  if (handle.opIdx === 0 && op.cmd.toLowerCase() === 'm') return null;
  return ops.filter((_, i) => i !== handle.opIdx);
}

export function extractTransformX(svg: string): number {
  const m = svg.match(/transform="translate\(\s*(-?\d*\.?\d+)/);
  return m ? parseFloat(m[1]) : 0;
}

export function extractD(svg: string): string {
  const m = svg.match(/<path[^>]*\bd="([^"]+)"/);
  return m ? m[1] : '';
}

export function replaceD(svg: string, newD: string): string {
  return svg.replace(/(<path[^>]*\bd=")[^"]+(")/, `$1${newD}$2`);
}
