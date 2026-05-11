'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  expandSelectionToControls,
  extractD,
  extractTransformX,
  getHandles,
  parsePath,
  type PathOp,
  removeOp,
  replaceD,
  serializePath,
  setHandle,
  softenAnchors,
  transformHandles,
} from '@/lib/pathOps';

type Props = {
  svg: string;
  onChange: (svg: string, final: boolean) => void;
  disabled?: boolean;
  selectedIds?: ReadonlySet<number>;
  onSelectionChange?: (ids: ReadonlySet<number>) => void;
  zoom?: number;
  pan?: { x: number; y: number };
  onPanChange?: (pan: { x: number; y: number }) => void;
};

type PanSession = {
  startMouseX: number;
  startMouseY: number;
  startPan: { x: number; y: number };
};

type Rect = { x1: number; y1: number; x2: number; y2: number };
type Pt = { x: number; y: number };
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

type MoveSession = {
  originalOps: PathOp[];
  originalSvg: string;
  startPos: Pt;
};

type ResizeSession = MoveSession & {
  pivot: Pt;
  startCorner: Pt;
  handleType: ResizeHandle;
};

type RotateSession = MoveSession & {
  pivot: Pt;
  startAngle: number;
};

const ROTATE_HANDLE_OFFSET = 36;

const CORNER_SIZE = 12;

export function PathEditor({
  svg,
  onChange,
  disabled,
  selectedIds,
  onSelectionChange,
  zoom = 1,
  pan = { x: 0, y: 0 },
  onPanChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [selRect, setSelRect] = useState<Rect | null>(null);
  const [moveSession, setMoveSession] = useState<MoveSession | null>(null);
  const [resizeSession, setResizeSession] = useState<ResizeSession | null>(null);
  const [rotateSession, setRotateSession] = useState<RotateSession | null>(null);
  const [panSession, setPanSession] = useState<PanSession | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      setSpaceHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      setSpaceHeld(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const { ops, xShift, handles } = useMemo(() => {
    const d = extractD(svg);
    const ops = d ? parsePath(d) : [];
    const xShift = extractTransformX(svg);
    return { ops, xShift, handles: getHandles(ops) };
  }, [svg]);

  const selBbox = useMemo(() => {
    if (!selectedIds || selectedIds.size === 0) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const id of selectedIds) {
      const h = handles[id];
      if (!h) continue;
      xs.push(h.x + xShift);
      ys.push(h.y);
    }
    if (xs.length === 0) return null;
    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
    };
  }, [selectedIds, handles, xShift]);

  if (disabled || handles.length === 0) return null;

  function svgPoint(clientX: number, clientY: number): Pt | null {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 1000,
      y: ((clientY - rect.top) / rect.height) * 1000,
    };
  }

  function deleteHandle(idx: number) {
    const newOps = removeOp(ops, idx);
    if (newOps) {
      const newD = serializePath(newOps);
      onChange(replaceD(svg, newD), true);
    }
  }

  function smoothAtAnchor(idx: number) {
    const h = handles[idx];
    if (!h || h.kind !== 'anchor') return;
    const newOps = softenAnchors(ops, new Set([idx]), 1, Infinity);
    const newD = serializePath(newOps);
    onChange(replaceD(svg, newD), true);
  }

  function handleAnchorDown(e: React.PointerEvent<SVGCircleElement>, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      deleteHandle(idx);
      return;
    }
    if (e.altKey) {
      smoothAtAnchor(idx);
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(idx);
  }

  function handleAnchorMove(e: React.PointerEvent<SVGCircleElement>) {
    if (dragging === null) return;
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const newDx = pt.x - xShift;
    const newDy = pt.y;
    const newOps = setHandle(ops, dragging, newDx, newDy);
    const newD = serializePath(newOps);
    onChange(replaceD(svg, newD), false);
  }

  function handleAnchorUp(e: React.PointerEvent<SVGCircleElement>) {
    if (dragging === null) return;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
    setDragging(null);
    onChange(svg, true);
  }

  function handleContextMenu(e: React.MouseEvent<SVGCircleElement>, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    deleteHandle(idx);
  }

  function handleBgDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.target !== e.currentTarget) return;
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (spaceHeld) {
      setPanSession({
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPan: pan,
      });
    } else {
      setSelRect({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    }
  }

  function handleBgMove(e: React.PointerEvent<SVGSVGElement>) {
    if (panSession && onPanChange) {
      const dx = e.clientX - panSession.startMouseX;
      const dy = e.clientY - panSession.startMouseY;
      onPanChange({
        x: panSession.startPan.x + dx,
        y: panSession.startPan.y + dy,
      });
      return;
    }
    if (!selRect) return;
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    setSelRect({ ...selRect, x2: pt.x, y2: pt.y });
  }

  function handleBgUp(e: React.PointerEvent<SVGSVGElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (panSession) {
      setPanSession(null);
      return;
    }
    if (!selRect) return;
    const w = Math.abs(selRect.x2 - selRect.x1);
    const h = Math.abs(selRect.y2 - selRect.y1);
    if (w < 4 && h < 4) {
      onSelectionChange?.(new Set());
    } else {
      const xMin = Math.min(selRect.x1, selRect.x2);
      const xMax = Math.max(selRect.x1, selRect.x2);
      const yMin = Math.min(selRect.y1, selRect.y2);
      const yMax = Math.max(selRect.y1, selRect.y2);
      const picked = new Set<number>();
      handles.forEach((h, i) => {
        const vx = h.x + xShift;
        const vy = h.y;
        if (vx >= xMin && vx <= xMax && vy >= yMin && vy <= yMax) {
          picked.add(i);
        }
      });
      onSelectionChange?.(expandSelectionToControls(handles, picked));
    }
    setSelRect(null);
  }

  function handleMoveDown(e: React.PointerEvent<SVGRectElement>) {
    e.preventDefault();
    e.stopPropagation();
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setMoveSession({ originalOps: ops, originalSvg: svg, startPos: pt });
  }

  function handleMoveMove(e: React.PointerEvent<SVGRectElement>) {
    if (!moveSession || !selectedIds) return;
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const dx = pt.x - moveSession.startPos.x;
    const dy = pt.y - moveSession.startPos.y;
    const newOps = transformHandles(
      moveSession.originalOps,
      selectedIds,
      dx,
      dy,
      1,
      1,
      0,
      0,
    );
    onChange(replaceD(moveSession.originalSvg, serializePath(newOps)), false);
  }

  function handleMoveUp(e: React.PointerEvent<SVGRectElement>) {
    if (!moveSession) return;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
    setMoveSession(null);
    onChange(svg, true);
  }

  function handleCornerDown(
    e: React.PointerEvent<SVGRectElement>,
    type: ResizeHandle,
  ) {
    if (!selBbox) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    let pivot: Pt;
    let startCorner: Pt;
    switch (type) {
      case 'tl':
        pivot = { x: selBbox.xMax, y: selBbox.yMax };
        startCorner = { x: selBbox.xMin, y: selBbox.yMin };
        break;
      case 'tr':
        pivot = { x: selBbox.xMin, y: selBbox.yMax };
        startCorner = { x: selBbox.xMax, y: selBbox.yMin };
        break;
      case 'bl':
        pivot = { x: selBbox.xMax, y: selBbox.yMin };
        startCorner = { x: selBbox.xMin, y: selBbox.yMax };
        break;
      case 'br':
        pivot = { x: selBbox.xMin, y: selBbox.yMin };
        startCorner = { x: selBbox.xMax, y: selBbox.yMax };
        break;
      case 't':
        pivot = { x: 0, y: selBbox.yMax };
        startCorner = { x: 0, y: selBbox.yMin };
        break;
      case 'b':
        pivot = { x: 0, y: selBbox.yMin };
        startCorner = { x: 0, y: selBbox.yMax };
        break;
      case 'l':
        pivot = { x: selBbox.xMax, y: 0 };
        startCorner = { x: selBbox.xMin, y: 0 };
        break;
      case 'r':
        pivot = { x: selBbox.xMin, y: 0 };
        startCorner = { x: selBbox.xMax, y: 0 };
        break;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    setResizeSession({
      originalOps: ops,
      originalSvg: svg,
      startPos: pt,
      pivot,
      startCorner,
      handleType: type,
    });
  }

  function handleCornerMove(e: React.PointerEvent<SVGRectElement>) {
    if (!resizeSession || !selectedIds) return;
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const { pivot, startCorner, handleType } = resizeSession;

    let scaleX = 1;
    let scaleY = 1;
    if (
      handleType === 'tl' ||
      handleType === 'tr' ||
      handleType === 'bl' ||
      handleType === 'br'
    ) {
      const origDiag = Math.hypot(
        startCorner.x - pivot.x,
        startCorner.y - pivot.y,
      );
      const curDiag = Math.hypot(pt.x - pivot.x, pt.y - pivot.y);
      if (origDiag === 0) return;
      const s = curDiag / origDiag;
      scaleX = s;
      scaleY = s;
    } else if (handleType === 't' || handleType === 'b') {
      if (startCorner.y === pivot.y) return;
      scaleY = (pt.y - pivot.y) / (startCorner.y - pivot.y);
    } else if (handleType === 'l' || handleType === 'r') {
      if (startCorner.x === pivot.x) return;
      scaleX = (pt.x - pivot.x) / (startCorner.x - pivot.x);
    }

    const pivotD: Pt = { x: pivot.x - xShift, y: pivot.y };
    const newOps = transformHandles(
      resizeSession.originalOps,
      selectedIds,
      0,
      0,
      scaleX,
      scaleY,
      pivotD.x,
      pivotD.y,
    );
    onChange(
      replaceD(resizeSession.originalSvg, serializePath(newOps)),
      false,
    );
  }

  function handleRotateDown(e: React.PointerEvent<SVGCircleElement>) {
    if (!selBbox) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const pivot: Pt = {
      x: (selBbox.xMin + selBbox.xMax) / 2,
      y: (selBbox.yMin + selBbox.yMax) / 2,
    };
    const startAngle = Math.atan2(pt.y - pivot.y, pt.x - pivot.x);
    (e.target as Element).setPointerCapture(e.pointerId);
    setRotateSession({
      originalOps: ops,
      originalSvg: svg,
      startPos: pt,
      pivot,
      startAngle,
    });
  }

  function handleRotateMove(e: React.PointerEvent<SVGCircleElement>) {
    if (!rotateSession || !selectedIds) return;
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const { pivot, startAngle } = rotateSession;
    const curAngle = Math.atan2(pt.y - pivot.y, pt.x - pivot.x);
    const rotation = curAngle - startAngle;
    const pivotD: Pt = { x: pivot.x - xShift, y: pivot.y };
    const newOps = transformHandles(
      rotateSession.originalOps,
      selectedIds,
      0,
      0,
      1,
      1,
      pivotD.x,
      pivotD.y,
      rotation,
    );
    onChange(
      replaceD(rotateSession.originalSvg, serializePath(newOps)),
      false,
    );
  }

  function handleRotateUp(e: React.PointerEvent<SVGCircleElement>) {
    if (!rotateSession) return;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
    setRotateSession(null);
    onChange(svg, true);
  }

  function handleCornerUp(e: React.PointerEvent<SVGRectElement>) {
    if (!resizeSession) return;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
    setResizeSession(null);
    onChange(svg, true);
  }

  const draggedHandle = dragging !== null ? handles[dragging] : null;
  const hasResizableSel =
    selBbox && selBbox.xMax > selBbox.xMin && selBbox.yMax > selBbox.yMin;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full"
      style={{
        cursor: panSession
          ? 'grabbing'
          : spaceHeld
            ? 'grab'
            : 'crosshair',
      }}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      onPointerDown={handleBgDown}
      onPointerMove={handleBgMove}
      onPointerUp={handleBgUp}
    >
      {handles.map((h, i) =>
        h.kind === 'control' && h.links
          ? h.links.map((link, j) => (
              <line
                key={`stem-${i}-${j}`}
                className="pointer-events-none"
                x1={h.x + xShift}
                y1={h.y}
                x2={link.x + xShift}
                y2={link.y}
                stroke="var(--hairline)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))
          : null,
      )}

      {selBbox && (
        <rect
          x={selBbox.xMin}
          y={selBbox.yMin}
          width={selBbox.xMax - selBbox.xMin}
          height={selBbox.yMax - selBbox.yMin}
          fill="transparent"
          stroke="#c2271e"
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move' }}
          onPointerDown={handleMoveDown}
          onPointerMove={handleMoveMove}
          onPointerUp={handleMoveUp}
        />
      )}

      {handles.map((h, i) => {
        const isAnchor = h.kind === 'anchor';
        const isSelected = !!selectedIds?.has(i);
        return (
          <circle
            key={i}
            cx={h.x + xShift}
            cy={h.y}
            r={isAnchor ? 8 : 6}
            fill={
              isSelected
                ? '#c2271e'
                : dragging === i
                  ? 'var(--ink)'
                  : isAnchor
                    ? 'var(--ink)'
                    : 'white'
            }
            stroke={isSelected ? '#c2271e' : 'var(--ink)'}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: dragging === i ? 'grabbing' : 'grab' }}
            onPointerDown={(e) => handleAnchorDown(e, i)}
            onPointerMove={handleAnchorMove}
            onPointerUp={handleAnchorUp}
            onContextMenu={(e) => handleContextMenu(e, i)}
          />
        );
      })}

      {hasResizableSel && (
        <>
          <line
            className="pointer-events-none"
            x1={(selBbox.xMin + selBbox.xMax) / 2}
            y1={selBbox.yMin}
            x2={(selBbox.xMin + selBbox.xMax) / 2}
            y2={selBbox.yMin - ROTATE_HANDLE_OFFSET}
            stroke="#c2271e"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={(selBbox.xMin + selBbox.xMax) / 2}
            cy={selBbox.yMin - ROTATE_HANDLE_OFFSET}
            r={8}
            fill="white"
            stroke="#c2271e"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'grab' }}
            onPointerDown={handleRotateDown}
            onPointerMove={handleRotateMove}
            onPointerUp={handleRotateUp}
          />
        </>
      )}

      {hasResizableSel &&
        (
          [
            { type: 'tl' as ResizeHandle, x: selBbox.xMin, y: selBbox.yMin, cur: 'nwse-resize' },
            { type: 'tr' as ResizeHandle, x: selBbox.xMax, y: selBbox.yMin, cur: 'nesw-resize' },
            { type: 'bl' as ResizeHandle, x: selBbox.xMin, y: selBbox.yMax, cur: 'nesw-resize' },
            { type: 'br' as ResizeHandle, x: selBbox.xMax, y: selBbox.yMax, cur: 'nwse-resize' },
            { type: 't' as ResizeHandle, x: (selBbox.xMin + selBbox.xMax) / 2, y: selBbox.yMin, cur: 'ns-resize' },
            { type: 'b' as ResizeHandle, x: (selBbox.xMin + selBbox.xMax) / 2, y: selBbox.yMax, cur: 'ns-resize' },
            { type: 'l' as ResizeHandle, x: selBbox.xMin, y: (selBbox.yMin + selBbox.yMax) / 2, cur: 'ew-resize' },
            { type: 'r' as ResizeHandle, x: selBbox.xMax, y: (selBbox.yMin + selBbox.yMax) / 2, cur: 'ew-resize' },
          ] as const
        ).map(({ type, x, y, cur }) => (
          <rect
            key={type}
            x={x - CORNER_SIZE / 2}
            y={y - CORNER_SIZE / 2}
            width={CORNER_SIZE}
            height={CORNER_SIZE}
            fill="white"
            stroke="#c2271e"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: cur }}
            onPointerDown={(e) => handleCornerDown(e, type)}
            onPointerMove={handleCornerMove}
            onPointerUp={handleCornerUp}
          />
        ))}

      {selRect && (
        <rect
          className="pointer-events-none"
          x={Math.min(selRect.x1, selRect.x2)}
          y={Math.min(selRect.y1, selRect.y2)}
          width={Math.abs(selRect.x2 - selRect.x1)}
          height={Math.abs(selRect.y2 - selRect.y1)}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {draggedHandle && (
        <text
          className="pointer-events-none"
          x={draggedHandle.x + xShift}
          y={draggedHandle.y - 18}
          fontSize={22}
          fontFamily="var(--font-geist-mono), monospace"
          fill="var(--ink)"
          textAnchor="middle"
        >
          {Math.round(draggedHandle.x)}, {Math.round(draggedHandle.y)}
        </text>
      )}
    </svg>
  );
}
