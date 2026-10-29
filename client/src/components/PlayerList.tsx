import type { Player } from '../types';

interface Props {
  players: Player[];
  selfId: string;
  hostId: string | null;
  drawerId?: string | null;
  showScores?: boolean;
  onKick?: (id: string, ban: boolean) => void;
}

export default function PlayerList({ players, selfId, hostId, drawerId, showScores, onKick }: Props) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const rankOf = (id: string) => ranked.findIndex((p) => p.id === id) + 1;

  return (
    <ul className="players">
      {players.map((p) => (
        <li key={p.id} className={`player ${p.id === selfId ? 'me' : ''} ${p.hasGuessed ? 'guessed' : ''}`}>
          {showScores && <span className="rank">#{rankOf(p.id)}</span>}
          <span className="avatar">{p.avatar}</span>
          <div className="pinfo">
            <div className="pname">
              {p.name}
              {p.id === selfId && <span className="muted small"> (you)</span>}
            </div>
            {showScores ? (
              <div className="muted small">{p.score} pts</div>
            ) : (
              <div className="muted small">{p.id === hostId ? 'Host' : p.ready ? '✅ Ready' : 'Not ready'}</div>
            )}
          </div>
          <span className="badges">
            {p.id === hostId && '👑'}
            {p.id === drawerId && '✏️'}
            {p.hasGuessed && '✔️'}
          </span>
          {onKick && p.id !== selfId && (
            <span className="kick">
              <button title="Kick" onClick={() => onKick(p.id, false)}>✖</button>
              <button title="Ban" onClick={() => onKick(p.id, true)}>🚫</button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
