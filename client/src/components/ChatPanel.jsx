import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ChatPanel({ messages, currentUserId, onSend, onClose }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>In-call chat</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close chat"
        >
          <X size={18} />
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet. Say hello to everyone!</p>
        )}

        {messages.map((message) => {
          const mine = message.userId === currentUserId;
          return (
            <div key={message.id} className={`chat-message ${mine ? 'mine' : ''}`}>
              <span className="chat-meta">
                {mine ? 'You' : message.name} · {formatTime(message.time)}
              </span>
              <div className="chat-bubble">{message.text}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          maxLength={1000}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={!text.trim()}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>
    </aside>
  );
}

export default ChatPanel;