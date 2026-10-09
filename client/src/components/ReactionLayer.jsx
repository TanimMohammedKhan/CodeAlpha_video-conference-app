import { EMOJI_BY_TYPE } from '../reactions';

function ReactionLayer({ reactions }) {
  return (
    <div className="reaction-layer" aria-hidden="true">
      {reactions.map((reaction) => (
        <div
          key={reaction.key}
          className="reaction-float"
          style={{ left: `${reaction.left}%` }}
        >
          <span className="reaction-emoji">{EMOJI_BY_TYPE[reaction.type]}</span>
          <span className="reaction-name">{reaction.name}</span>
        </div>
      ))}
    </div>
  );
}

export default ReactionLayer;