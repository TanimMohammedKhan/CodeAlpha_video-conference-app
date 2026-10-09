import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Download,
  Eraser,
  Maximize,
  Minimize,
  Minus,
  Pencil,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useFullscreen } from '../hooks/useFullscreen';
import '../whiteboard.css';

// The board has a fixed size so every screen draws exactly the same picture
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const SEND_INTERVAL = 40;

const TOOLS = [
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
];

const COLORS = [
  '#1b1530',
  '#6c47e0',
  '#d6409f',
  '#e5484d',
  '#f08c2e',
  '#2f9e6e',
  '#2b7de9',
];

const SIZES = [
  { label: 'Thin', value: 6, dot: 6 },
  { label: 'Medium', value: 12, dot: 11 },
  { label: 'Thick', value: 24, dot: 17 },
];

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function drawStroke(ctx, stroke, width, height) {
  const { tool, color, size, points } = stroke;
  if (!points || points.length === 0) return;

  const lineWidth = tool === 'eraser' ? size * 3 : size;
  const px = (point) => point[0] * width;
  const py = (point) => point[1] * height;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';

  if (tool === 'pen' || tool === 'eraser') {
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(px(points[0]), py(points[0]), lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(px(points[0]), py(points[0]));
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (px(points[i]) + px(points[i + 1])) / 2;
        const midY = (py(points[i]) + py(points[i + 1])) / 2;
        ctx.quadraticCurveTo(px(points[i]), py(points[i]), midX, midY);
      }
      const last = points[points.length - 1];
      ctx.lineTo(px(last), py(last));
      ctx.stroke();
    }
  } else if (points.length >= 2) {
    const a = points[0];
    const b = points[1];

    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(
        Math.min(px(a), px(b)),
        Math.min(py(a), py(b)),
        Math.abs(px(b) - px(a)),
        Math.abs(py(b) - py(a))
      );
    } else if (tool === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(
        (px(a) + px(b)) / 2,
        (py(a) + py(b)) / 2,
        Math.abs(px(b) - px(a)) / 2,
        Math.abs(py(b) - py(a)) / 2,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

function renderBoard(canvas, board) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  board.getStrokes().forEach((stroke) => {
    drawStroke(ctx, stroke, canvas.width, canvas.height);
  });

  const preview = board.getPreview();
  if (preview) {
    drawStroke(ctx, preview, canvas.width, canvas.height);
  }
}

function Whiteboard({ board, onStroke, onUndo, onClear, canClear }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const drawing = useRef(null);
  const { isFullscreen, supported, toggle } = useFullscreen(rootRef);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1].value);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Redraw whenever the board changes
  useEffect(() => {
    let frame = 0;

    const draw = () => {
      frame = 0;
      if (canvasRef.current) renderBoard(canvasRef.current, board);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    schedule();
    const unsubscribe = board.subscribe(schedule);

    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [board]);

  // Fit the board to the available space, keeping the 16:9 shape
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const update = () => {
      const availableWidth = Math.max(0, stage.clientWidth - 24);
      const availableHeight = Math.max(0, stage.clientHeight - 24);
      const width = Math.min(availableWidth, availableHeight * (16 / 9));
      setCanvasSize({
        width: Math.floor(width),
        height: Math.floor((width * 9) / 16),
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Ctrl + Z undoes your last stroke
  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onUndo]);

  const getPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [
      round4(clamp01((e.clientX - rect.left) / rect.width)),
      round4(clamp01((e.clientY - rect.top) / rect.height)),
    ];
  };

  // Send the points collected since the last send
  const flush = (d) => {
    if (d.queue.length === 0) return;
    onStroke({
      id: d.id,
      tool: d.tool,
      color: d.color,
      size: d.size,
      points: d.queue,
    });
    d.queue = [];
    d.lastSent = performance.now();
  };

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const point = getPoint(e);
    const isFreehand = tool === 'pen' || tool === 'eraser';
    const d = {
      id: createId(),
      tool,
      color,
      size,
      isFreehand,
      start: point,
      queue: [],
      lastSent: performance.now(),
    };
    drawing.current = d;

    if (isFreehand) {
      const first = { id: d.id, tool, color, size, points: [point] };
      board.applyChunk(first);
      onStroke(first);
    }
  };

  const handlePointerMove = (e) => {
    const d = drawing.current;
    if (!d) return;

    const point = getPoint(e);

    if (d.isFreehand) {
      board.applyChunk({
        id: d.id,
        tool: d.tool,
        color: d.color,
        size: d.size,
        points: [point],
      });
      d.queue.push(point);

      if (performance.now() - d.lastSent >= SEND_INTERVAL) flush(d);
    } else {
      board.setPreview({
        id: d.id,
        tool: d.tool,
        color: d.color,
        size: d.size,
        points: [d.start, point],
      });
    }
  };

  const handlePointerUp = (e) => {
    const d = drawing.current;
    if (!d) return;
    drawing.current = null;

    if (d.isFreehand) {
      flush(d);
      return;
    }

    const end = getPoint(e);
    board.setPreview(null);

    // A click without dragging does not make a shape
    if (
      Math.abs(end[0] - d.start[0]) < 0.002 &&
      Math.abs(end[1] - d.start[1]) < 0.002
    ) {
      return;
    }

    const stroke = {
      id: d.id,
      tool: d.tool,
      color: d.color,
      size: d.size,
      points: [d.start, end],
    };
    board.applyChunk(stroke);
    onStroke(stroke);
  };

  const handlePointerCancel = () => {
    const d = drawing.current;
    drawing.current = null;
    if (!d) return;

    if (d.isFreehand) {
      flush(d);
    } else {
      board.setPreview(null);
    }
  };

  const handleClear = () => {
    if (window.confirm('Clear the whole whiteboard for everyone?')) {
      onClear();
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Add a white background, because the board itself is transparent
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const ctx = output.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `whiteboard-${Date.now()}.png`;
    link.href = output.toDataURL('image/png');
    link.click();
  };

  return (
    <section className="whiteboard" ref={rootRef}>
      <div className="wb-toolbar">
        <div className="wb-group">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`wb-btn ${tool === id ? 'active' : ''}`}
              onClick={() => setTool(id)}
              aria-label={label}
              title={label}
            >
              <Icon size={19} />
            </button>
          ))}
        </div>

        <div className="wb-group">
          {COLORS.map((value) => (
            <button
              key={value}
              type="button"
              className={`wb-color ${color === value ? 'active' : ''}`}
              style={{ background: value }}
              onClick={() => setColor(value)}
              aria-label={`Color ${value}`}
            />
          ))}
        </div>

        <div className="wb-group">
          {SIZES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`wb-btn ${size === item.value ? 'active' : ''}`}
              onClick={() => setSize(item.value)}
              aria-label={`${item.label} brush`}
              title={`${item.label} brush`}
            >
              <span
                className="wb-size-dot"
                style={{ width: item.dot, height: item.dot }}
              />
            </button>
          ))}
        </div>

        <div className="wb-group wb-actions">
          <button
            type="button"
            className="wb-btn"
            onClick={onUndo}
            aria-label="Undo your last stroke"
            title="Undo your last stroke (Ctrl + Z)"
          >
            <Undo2 size={19} />
          </button>

          {canClear && (
            <button
              type="button"
              className="wb-btn"
              onClick={handleClear}
              aria-label="Clear the board for everyone"
              title="Clear the board for everyone"
            >
              <Trash2 size={19} />
            </button>
          )}

          <button
            type="button"
            className="wb-btn"
            onClick={handleDownload}
            aria-label="Save as image"
            title="Save as image"
          >
            <Download size={19} />
          </button>

          {supported && (
            <button
              type="button"
              className="wb-btn"
              onClick={toggle}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
            </button>
          )}
        </div>
      </div>

      <div className="wb-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="wb-canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ width: canvasSize.width, height: canvasSize.height }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      </div>
    </section>
  );
}

export default Whiteboard;