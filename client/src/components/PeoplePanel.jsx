import { Hand, Lock, Mic, MicOff, UserX, X } from 'lucide-react';

function getInitials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function PeoplePanel({
  selfName,
  selfMicOn,
  selfHand,
  selfUserId,
  hostId,
  participants,
  isHost,
  locked,
  onMuteAll,
  onMuteUser,
  onRemove,
  onToggleLock,
  onClose,
}) {
  // People with a raised hand come first
  const others = [...participants].sort(
    (a, b) => Number(Boolean(b.handRaised)) - Number(Boolean(a.handRaised))
  );

  const handleRemove = (person) => {
    const name = person.name || 'this person';
    if (window.confirm(`Remove ${name} from the meeting?`)) {
      onRemove(person.id);
    }
  };

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>People ({participants.length + 1})</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close people"
        >
          <X size={18} />
        </button>
      </div>

      {isHost && (
        <div className="people-host-bar">
          <button type="button" className="btn btn-ghost" onClick={onMuteAll}>
            <MicOff size={16} />
            Mute all
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${locked ? 'locked' : ''}`}
            onClick={onToggleLock}
          >
            <Lock size={16} />
            {locked ? 'Unlock meeting' : 'Lock meeting'}
          </button>
        </div>
      )}

      <ul className="people-list">
        <li className="person">
          <div className="person-avatar">{getInitials(selfName)}</div>
          <div className="person-info">
            <div className="person-name">
              {selfName} (You)
              {selfUserId === hostId && <span className="person-tag">Host</span>}
            </div>
          </div>
          <div className="person-status">
            {selfHand && <Hand size={16} className="hand-icon" />}
            {selfMicOn ? <Mic size={16} /> : <MicOff size={16} className="mic-off" />}
          </div>
        </li>

        {others.map((person) => (
          <li key={person.id} className="person">
            <div className="person-avatar">{getInitials(person.name)}</div>
            <div className="person-info">
              <div className="person-name">
                {person.name || 'Participant'}
                {person.userId === hostId && <span className="person-tag">Host</span>}
              </div>
            </div>
            <div className="person-status">
              {person.handRaised && <Hand size={16} className="hand-icon" />}
              {person.micOn ? (
                <Mic size={16} />
              ) : (
                <MicOff size={16} className="mic-off" />
              )}
            </div>

            {isHost && person.micOn && (
              <button
                type="button"
                className="person-action"
                onClick={() => onMuteUser(person.id)}
                aria-label={`Mute ${person.name || 'participant'}`}
                title="Mute"
              >
                <MicOff size={16} />
              </button>
            )}

            {isHost && (
              <button
                type="button"
                className="person-action danger"
                onClick={() => handleRemove(person)}
                aria-label={`Remove ${person.name || 'participant'}`}
                title="Remove from meeting"
              >
                <UserX size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default PeoplePanel;