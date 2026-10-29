import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import type { Stroke } from '../types';

// Logical canvas size. Coordinates sent over the wire are in these units,
// so every client renders identically no matter how big the <canvas> is on screen.
const W = 800;
const H = 600;

const COLORS = [
  '#000000', '#7f7f7f', '#ffffff', '#c1272d', '#ff6b35', '#ffd23f', '#3bb273', '#0b6e4f',
  '#00b4d8', '#1d4ed8', '#7b2cbf', '#ff6fb5', '#8d5524', '#e0ac69', '#fde4c8', '#4a4e69',
];
const SIZES = [4, 8, 16, 28];

interface Props {
  canDraw: boolean;
}

export default function DrawingCanvas({ canDraw }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(8);
  const [eraser, setEraser] = useState(false);

  const ctx = () => canvasRef.current!.getContext('2d')!;

  const dot = (x: number, y: number, c: string, s: number) => {
    const g = ctx();
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, s / 2, 0, Math.PI * 2);
    g.fill();
  };

  const segment = (a: [number, number], b: [number, number], c: string, s: number) => {
    const g = ctx();
    g.strokeStyle = c;
    g.lineWidth = s;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  };

  const redraw = () => {
    const g = ctx();
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    for (const s of strokes.current) {
      if (s.points.length === 1) dot(s.points[0][0], s.points[0][1], s.color, s.size);
      for (let i = 1; i < s.points.length; i++) segment(s.points[i - 1], s.points[i], s.color, s.size);
    }
  };

  // Listen for everything the server broadcasts about the canvas.
  useEffect(() => {
    redraw();

    const onData = (d: { type: 'start' | 'move' | 'end'; x?: number; y?: number; color?: string; size?: number }) => {
      if (d.type === 'start') {
        const s: Stroke = { color: d.color!, size: d.size!, points: [[d.x!, d.y!]] };
        strokes.current.push(s);
        current.current = s;
        dot(d.x!, d.y!, s.color, s.size);
      } else if (d.type === 'move') {
        const s = current.current;
        if (!s) return;
        const prev = s.points[s.points.length - 1];
        const next: [number, number] = [d.x!, d.y!];
        s.points.push(next);
        segment(prev, next, s.color, s.size);
      } else {
        current.current = null;
      }
    };
    const onUndo = () => {
      strokes.current.pop();
      current.current = null;
      redraw();
    };
    const onClear = () => {
      strokes.current = [];
      current.current = null;
      redraw();
    };
    const onState = ({ strokes: s }: { strokes: Stroke[] }) => {
      strokes.current = s;
      current.current = null;
      redraw();
    };

    socket.on('draw_data', onData);
    socket.on('draw_undo', onUndo);
    socket.on('canvas_clear', onClear);
    socket.on('canvas_state', onState);
    socket.emit('request_canvas'); // late joiners / freshly mounted canvases get the history
    return () => {
      socket.off('draw_data', onData);
      socket.off('draw_undo', onUndo);
      socket.off('canvas_clear', onClear);
      socket.off('canvas_state', onState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If drawing rights vanish mid-stroke (time up), drop the in-progress stroke.
  useEffect(() => {
    if (!canDraw) current.current = null;
  }, [canDraw]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) * W) / r.width;
    const y = ((e.clientY - r.top) * H) / r.height;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    const s: Stroke = { color: eraser ? '#ffffff' : color, size: eraser ? size * 2 : size, points: [[x, y]] };
    strokes.current.push(s);
    current.current = s;
    dot(x, y, s.color, s.size);
    socket.emit('draw_start', { x, y, color: s.color, size: s.size });
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!canDraw || !s) return;
    const [x, y] = pos(e);
    const prev = s.points[s.points.length - 1];
    if (Math.hypot(x - prev[0], y - prev[1]) < 1.5) return; // skip jitter
    s.points.push([x, y]);
    segment(prev, [x, y], s.color, s.size);
    socket.emit('draw_move', { x, y });
  };

  const onUp = () => {
    if (!current.current) return;
    current.current = null;
    socket.emit('draw_end', {});
  };

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className={canDraw ? 'drawable' : ''}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {canDraw && (
        <div className="toolbar">
          <div className="palette">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${!eraser && color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => {
                  setColor(c);
                  setEraser(false);
                }}
                aria-label={`color ${c}`}
              />
            ))}
          </div>
          <div className="tools">
            {SIZES.map((s) => (
              <button key={s} className={`size ${size === s ? 'active' : ''}`} onClick={() => setSize(s)} title={`Size ${s}`}>
                <span style={{ width: Math.min(s, 22), height: Math.min(s, 22) }} />
              </button>
            ))}
            <button className={`btn small ${eraser ? 'primary' : ''}`} onClick={() => setEraser((v) => !v)}>🧽 Eraser</button>
            <button className="btn small" onClick={() => socket.emit('draw_undo')}>↩ Undo</button>
            <button className="btn small danger" onClick={() => socket.emit('canvas_clear')}>🗑 Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
