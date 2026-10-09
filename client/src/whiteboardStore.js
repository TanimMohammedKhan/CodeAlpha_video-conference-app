export function createBoardStore() {
  let strokes = [];
  let preview = null;
  const listeners = new Set();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getStrokes: () => strokes,
    getPreview: () => preview,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setStrokes(next) {
      strokes = next;
      notify();
    },

    setPreview(next) {
      preview = next;
      notify();
    },

    // Add a new stroke, or add more points to a stroke that already exists
    applyChunk(chunk) {
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].id === chunk.id) {
          strokes[i].points.push(...chunk.points);
          notify();
          return;
        }
      }

      strokes.push({
        id: chunk.id,
        tool: chunk.tool,
        color: chunk.color,
        size: chunk.size,
        points: [...chunk.points],
      });
      notify();
    },

    remove(id) {
      strokes = strokes.filter((stroke) => stroke.id !== id);
      notify();
    },

    clear() {
      strokes = [];
      preview = null;
      notify();
    },
  };
}