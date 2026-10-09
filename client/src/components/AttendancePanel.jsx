import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { apiRequest } from '../api';
import '../attendance.css';

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} sec`;
}

function formatClock(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Wrap a value for a CSV file. Text that starts like a spreadsheet formula
// is changed so Excel can never run it.
function csvCell(value) {
  let text = String(value === null || value === undefined ? '' : value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(report) {
  const header = [
    'Name',
    'Email',
    'Role',
    'First joined',
    'Last left',
    'Total time (minutes)',
    'Times joined',
    'Status',
  ];

  const rows = report.participants.map((p) => [
    p.name,
    p.email,
    p.role,
    new Date(p.firstJoin).toLocaleString(),
    p.lastLeave ? new Date(p.lastLeave).toLocaleString() : '',
    (p.totalSeconds / 60).toFixed(1),
    p.sessions,
    p.present ? 'In meeting' : 'Left',
  ]);

  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  // The first character lets Excel read names with accents correctly
  return `\uFEFF${lines.join('\r\n')}`;
}

function AttendancePanel({ code, token, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  // Load the report now and refresh it every 10 seconds while the panel is open
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      apiRequest(`/api/meetings/${code}/attendance`, { token })
        .then((data) => {
          if (!cancelled) {
            setReport(data);
            setError('');
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
    };

    load();
    const timer = setInterval(load, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, token]);

  const handleDownload = () => {
    if (!report) return;

    const blob = new Blob([buildCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-${report.meeting.roomCode}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const participants = report ? report.participants : [];
  const presentNow = participants.filter((p) => p.present).length;

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>Attendance</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close attendance"
        >
          <X size={18} />
        </button>
      </div>

      <div className="attendance-body">
        {error && <div className="attendance-error">{error}</div>}

        <div className="attendance-summary">
          <div className="stat">
            <div className="stat-value">{participants.length}</div>
            <div className="stat-label">Attended</div>
          </div>
          <div className="stat">
            <div className="stat-value">{presentNow}</div>
            <div className="stat-label">In meeting now</div>
          </div>
        </div>

        <ul className="attendee-list">
          {report && participants.length === 0 && (
            <li className="attendee-empty">Nobody has joined yet.</li>
          )}

          {participants.map((p) => (
            <li key={p.userId} className="attendee">
              <span
                className={`status-dot ${p.present ? 'live' : ''}`}
                title={p.present ? 'In the meeting' : 'Left'}
              />
              <div className="attendee-info">
                <div className="attendee-name" title={p.email}>
                  {p.name}
                </div>
                <div className="attendee-meta">
                  {p.role} · joined {formatClock(p.firstJoin)}
                  {p.lastLeave ? ` · left ${formatClock(p.lastLeave)}` : ''}
                </div>
              </div>
              <div className="attendee-time">{formatDuration(p.totalSeconds)}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="attendance-footer">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleDownload}
          disabled={!report || participants.length === 0}
        >
          <Download size={18} />
          Download CSV
        </button>
      </div>
    </aside>
  );
}

export default AttendancePanel;