import { useEffect, useRef, useState } from 'react';
import { Check, Download, Pencil, Trash2, X } from 'lucide-react';
import '../focus.css';

const MAX_LENGTH = 500;

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildMarkdown(title, notes) {
  const plain = notes.filter((note) => note.kind === 'note');
  const tasks = notes.filter((note) => note.kind === 'task');

  const lines = [
    `# ${title} - meeting notes`,
    '',
    `Saved on ${new Date().toLocaleString()}`,
    '',
    '## Notes',
    '',
  ];

  if (plain.length === 0) lines.push('_No notes._');
  plain.forEach((note) => lines.push(`- ${note.text} (${note.name})`));

  lines.push('', '## Action items', '');
  if (tasks.length === 0) lines.push('_No action items._');
  tasks.forEach((note) => {
    lines.push(`- [${note.done ? 'x' : ' '}] ${note.text} (${note.name})`);
  });

  return lines.join('\n');
}

function NotesPanel({
  notes,
  currentUserId,
  hostUserId,
  title,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onClose,
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('note');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const endRef = useRef(null);
  const isHost = currentUserId === hostUserId;

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [notes.length]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed, kind);
    setText('');
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const saveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && editingId) onEdit(editingId, trimmed);
    setEditingId(null);
  };

  const handleDownload = () => {
    const blob = new Blob([buildMarkdown(title, notes)], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meeting-notes.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>Shared notes</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close notes"
        >
          <X size={18} />
        </button>
      </div>

      <div className="notes-body">
        <ul className="notes-list">
          {notes.length === 0 && (
            <li className="notes-empty">
              No notes yet. Add key points, questions and action items for everyone.
            </li>
          )}

          {notes.map((note) => {
            const canEdit = note.userId === currentUserId;
            const canDelete = canEdit || isHost;
            const isTask = note.kind === 'task';

            return (
              <li
                key={note.id}
                className={`note-item ${isTask ? 'task' : ''} ${note.done ? 'done' : ''}`}
              >
                {isTask ? (
                  <input
                    type="checkbox"
                    className="note-check"
                    checked={note.done}
                    onChange={() => onToggle(note.id)}
                    aria-label="Mark as done"
                  />
                ) : (
                  <span className="note-bullet" />
                )}

                <div className="note-main">
                  {editingId === note.id ? (
                    <input
                      className="note-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      maxLength={MAX_LENGTH}
                      autoFocus
                    />
                  ) : (
                    <div className="note-text">{note.text}</div>
                  )}
                  <div className="note-meta">
                    {note.name} · {formatTime(note.time)}
                    {note.edited ? ' · edited' : ''}
                  </div>
                </div>

                <div className="note-actions">
                  {editingId === note.id ? (
                    <button
                      type="button"
                      className="note-btn"
                      onClick={saveEdit}
                      aria-label="Save"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                  ) : (
                    canEdit && (
                      <button
                        type="button"
                        className="note-btn"
                        onClick={() => startEdit(note)}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                    )
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="note-btn danger"
                      onClick={() => onDelete(note.id)}
                      aria-label="Delete"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          <li ref={endRef} />
        </ul>

        <form className="notes-form" onSubmit={handleSubmit}>
          <div className="seg">
            <button
              type="button"
              className={kind === 'note' ? 'active' : ''}
              onClick={() => setKind('note')}
            >
              Note
            </button>
            <button
              type="button"
              className={kind === 'task' ? 'active' : ''}
              onClick={() => setKind('task')}
            >
              Action item
            </button>
          </div>
          <div className="notes-form-row">
            <input
              className="note-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === 'task' ? 'Who does what?' : 'Write a note'}
              maxLength={MAX_LENGTH}
            />
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              Add
            </button>
          </div>
        </form>

        <div className="notes-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleDownload}
            disabled={notes.length === 0}
          >
            <Download size={18} />
            Download notes
          </button>
        </div>
      </div>
    </aside>
  );
}

export default NotesPanel;