import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, Hash, Plus, Video } from 'lucide-react';
import { apiRequest } from '../api';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import '../meetings.css';

const ROLE_MESSAGES = {
  student: 'Join your classes and study groups in one click.',
  teacher: 'Start a class, share your screen and teach on the whiteboard.',
  professional: 'Run focused meetings with your team.',
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatToday() {
  return new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatDate(value) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function Dashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [meetings, setMeetings] = useState([]);
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [startError, setStartError] = useState('');
  const [joinError, setJoinError] = useState('');
  // A message sent from another page, for example "You were removed from the meeting"
  const [notice] = useState(() => (location.state && location.state.notice) || '');
  const firstName = user.name.split(' ')[0];

  // Forget the message after showing it, so a refresh does not show it again
  useEffect(() => {
    if (location.state && location.state.notice) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  useEffect(() => {
    let cancelled = false;

    apiRequest('/api/meetings', { token })
      .then((data) => {
        if (!cancelled) setMeetings(data.meetings);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleStart = async () => {
    setStartError('');
    setStarting(true);
    try {
      const data = await apiRequest('/api/meetings', {
        method: 'POST',
        token,
        body: { title: `${firstName}'s meeting` },
      });
      navigate(`/room/${data.meeting.room_code}`);
    } catch (err) {
      setStartError(err.message);
      setStarting(false);
    }
  };

  const handleJoin = async () => {
    setJoinError('');
    // Accept either a plain code or a full invite link
    const cleanCode = code.trim().split('/').pop().toLowerCase();

    if (!cleanCode) {
      setJoinError('Please enter a meeting code');
      return;
    }

    setJoining(true);
    try {
      await apiRequest(`/api/meetings/${cleanCode}`, { token });
      navigate(`/room/${cleanCode}`);
    } catch (err) {
      setJoinError(err.message);
      setJoining(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="page">
        {notice && (
          <div className="alert" style={{ marginBottom: 20 }}>
            {notice}
          </div>
        )}

        <section className="hero">
          <span className="hero-chip">{formatToday()}</span>
          <h1>
            {getGreeting()}, {firstName}
          </h1>
          <p>{ROLE_MESSAGES[user.role]}</p>
        </section>

        <div className="action-grid">
          <div className="surface action-card">
            <div className="icon-bubble">
              <Video size={22} />
            </div>
            <h3>New meeting</h3>
            <p>Start an instant meeting and invite others with a code.</p>
            {startError && <div className="alert">{startError}</div>}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStart}
              disabled={starting}
            >
              <Plus size={18} />
              {starting ? 'Starting...' : 'Start meeting'}
            </button>
          </div>

          <div className="surface action-card">
            <div className="icon-bubble">
              <Hash size={22} />
            </div>
            <h3>Join with a code</h3>
            <p>Enter the code or link you received to join a meeting.</p>
            {joinError && <div className="alert">{joinError}</div>}
            <div className="join-row">
              <div className="input-wrap">
                <Hash className="input-icon" size={18} />
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="abc-defg-hij"
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleJoin}
                disabled={joining}
              >
                {joining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>
        </div>

        <section className="surface panel">
          <h3>Recent meetings</h3>

          {meetings.length === 0 ? (
            <div className="empty-state">
              <CalendarClock size={32} />
              <p>No meetings yet. Your meeting history will appear here.</p>
            </div>
          ) : (
            <ul className="meeting-list">
              {meetings.map((meeting) => (
                <li key={meeting.id} className="meeting-item">
                  <div>
                    <div className="meeting-title">{meeting.title}</div>
                    <div className="meeting-meta">
                      {meeting.room_code} · {formatDate(meeting.created_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => navigate(`/room/${meeting.room_code}`)}
                  >
                    Rejoin
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

export default Dashboard;