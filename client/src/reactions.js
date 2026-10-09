export const REACTIONS = [
  { type: 'thumbs', emoji: '👍', label: 'Thumbs up' },
  { type: 'clap', emoji: '👏', label: 'Clap' },
  { type: 'heart', emoji: '❤️', label: 'Love' },
  { type: 'laugh', emoji: '😂', label: 'Laugh' },
  { type: 'wow', emoji: '😮', label: 'Surprised' },
  { type: 'party', emoji: '🎉', label: 'Celebrate' },
];

export const EMOJI_BY_TYPE = Object.fromEntries(
  REACTIONS.map((reaction) => [reaction.type, reaction.emoji])
);