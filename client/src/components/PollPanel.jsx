import { useState } from 'react';
import { Check, Plus, Trash2, Trophy, X } from 'lucide-react';
import '../polls.css';

const MAX_OPTIONS = 6;

function percent(count, total) {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function ResultBars({ options, counts, total, correctIndex, myVote }) {
  return (
    <ul className="result-bars">
      {options.map((option, index) => {
        const isCorrect = correctIndex === index;
        const isMine = myVote === index;
        const share = percent(counts[index], total);

        return (
          <li
            key={index}
            className={`result-row ${isCorrect ? 'correct' : ''} ${isMine ? 'mine' : ''}`}
          >
            <div className="result-fill" style={{ width: `${share}%` }} />
            <span className="result-label">
              {isCorrect && <Check size={14} />}
              {option}
              {isMine && <em>(your answer)</em>}
            </span>
            <span className="result-count">
              {counts[index]} · {share}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ResultCard({ result }) {
  const answered = result.myVote !== null && result.myVote !== undefined;
  const right = result.isQuiz && answered && result.myVote === result.correctIndex;

  return (
    <div className="poll-card">
      <div className="poll-question">{result.question}</div>
      <ResultBars
        options={result.options}
        counts={result.counts}
        total={result.total}
        correctIndex={result.isQuiz ? result.correctIndex : null}
        myVote={result.myVote}
      />
      <div className="poll-foot">
        {result.total} answered
        {result.isQuiz && answered && (
          <span className={`poll-verdict ${right ? 'right' : 'wrong'}`}>
            {right ? ' · You got it right' : ' · Not quite'}
          </span>
        )}
        {result.isQuiz && !answered && ' · You did not answer'}
      </div>
    </div>
  );
}

function PollPanel({
  isHost,
  poll,
  myVote,
  counts,
  history,
  scores,
  currentUserId,
  onStart,
  onVote,
  onEnd,
  onClose,
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [quizMode, setQuizMode] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateOption = (index, value) => {
    setOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
  };

  const addOption = () => {
    if (options.length < MAX_OPTIONS) setOptions((prev) => [...prev, '']);
  };

  const removeOption = (index) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
    if (correct === index) {
      setCorrect(0);
    } else if (correct > index) {
      setCorrect(correct - 1);
    }
  };

  const handleStart = async (e) => {
    e.preventDefault();
    setError('');

    const cleaned = options.map((option) => option.trim());
    if (!question.trim()) {
      setError('Please write a question.');
      return;
    }
    if (cleaned.some((option) => !option)) {
      setError('Fill in every option or remove the empty ones.');
      return;
    }

    setBusy(true);
    try {
      await onStart({
        question: question.trim(),
        options: cleaned,
        correctIndex: quizMode ? correct : null,
      });
      setQuestion('');
      setOptions(['', '']);
      setQuizMode(false);
      setCorrect(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async (index) => {
    setError('');
    try {
      await onVote(poll.id, index);
    } catch (err) {
      setError(err.message);
    }
  };

  const hasVoted = myVote !== null && myVote !== undefined;
  const liveCounts =
    poll && counts && counts.id === poll.id
      ? counts
      : poll
        ? { counts: poll.options.map(() => 0), total: 0, correctIndex: null }
        : null;

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>Polls &amp; quizzes</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close polls"
        >
          <X size={18} />
        </button>
      </div>

      <div className="polls-body">
        {error && <div className="poll-error">{error}</div>}

        {/* The poll that is open right now */}
        {poll && (
          <div className="poll-card live">
            <span className="poll-live-tag">{poll.isQuiz ? 'LIVE QUIZ' : 'LIVE POLL'}</span>
            <div className="poll-question">{poll.question}</div>

            {isHost ? (
              <>
                <ResultBars
                  options={poll.options}
                  counts={liveCounts.counts}
                  total={liveCounts.total}
                  correctIndex={poll.isQuiz ? liveCounts.correctIndex : null}
                  myVote={null}
                />
                <div className="poll-foot">{liveCounts.total} answered so far</div>
                <button type="button" className="btn btn-primary" onClick={onEnd}>
                  End and show results
                </button>
              </>
            ) : (
              <>
                <ul className="vote-list">
                  {poll.options.map((option, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        className={`vote-option ${myVote === index ? 'selected' : ''}`}
                        onClick={() => handleVote(index)}
                        disabled={hasVoted}
                      >
                        {option}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="poll-wait">
                  {hasVoted
                    ? 'Answer sent. Results appear when the host ends the poll.'
                    : 'Choose one answer.'}
                </div>
              </>
            )}
          </div>
        )}

        {/* Create a new poll (host only, when none is open) */}
        {isHost && !poll && (
          <form className="poll-form" onSubmit={handleStart}>
            <div className="polls-section-title">New poll</div>

            <input
              className="poll-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Your question"
              maxLength={200}
            />

            {options.map((option, index) => (
              <div key={index} className="poll-option-row">
                {quizMode && (
                  <input
                    type="radio"
                    className="correct-radio"
                    name="correct-option"
                    checked={correct === index}
                    onChange={() => setCorrect(index)}
                    title="Mark as the correct answer"
                    aria-label={`Option ${index + 1} is the correct answer`}
                  />
                )}
                <input
                  className="poll-input"
                  type="text"
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  maxLength={100}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className="poll-icon-btn"
                    onClick={() => removeOption(index)}
                    aria-label={`Remove option ${index + 1}`}
                    title="Remove option"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}

            {options.length < MAX_OPTIONS && (
              <button type="button" className="btn btn-ghost poll-add" onClick={addOption}>
                <Plus size={15} />
                Add option
              </button>
            )}

            <label className="quiz-toggle">
              <input
                type="checkbox"
                checked={quizMode}
                onChange={(e) => setQuizMode(e.target.checked)}
              />
              Quiz mode (one answer is correct)
            </label>
            {quizMode && (
              <div className="quiz-hint">
                Select the round button next to the correct answer. Students only see it
                after you end the quiz.
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Starting...' : 'Start for everyone'}
            </button>
          </form>
        )}

        {!isHost && !poll && history.length === 0 && (
          <p className="poll-empty">
            No polls yet. When the host starts one, it will open here.
          </p>
        )}

        {/* Quiz points for the whole meeting */}
        {scores.length > 0 && (
          <div>
            <div className="polls-section-title">
              <Trophy size={14} />
              Leaderboard
            </div>
            <ol className="leaderboard" style={{ marginTop: 8 }}>
              {scores.slice(0, 5).map((entry, index) => (
                <li
                  key={entry.userId}
                  className={`leader ${entry.userId === currentUserId ? 'me' : ''}`}
                >
                  <span className="leader-rank">{index + 1}</span>
                  <span className="leader-name">
                    {entry.name}
                    {entry.userId === currentUserId ? ' (You)' : ''}
                  </span>
                  <span className="leader-score">
                    {entry.correct} / {entry.answered}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Finished polls */}
        {history.length > 0 && (
          <div className="poll-form">
            <div className="polls-section-title">Results</div>
            {history.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export default PollPanel;