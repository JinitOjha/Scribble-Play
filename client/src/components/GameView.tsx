import { socket } from '../socket';
import type { ChatMsg, GameState, Player, RoomInfo } from '../types';
import DrawingCanvas from './DrawingCanvas';
import PlayerList from './PlayerList';
import Chat from './Chat';

interface Props {
  room: RoomInfo;
  game: GameState;
  players: Player[];
  selfId: string;
  messages: ChatMsg[];
  onLeave: () => void;
}

const REASONS: Record<string, string> = {
  time: "Time's up!",
  all_guessed: 'Everyone guessed it!',
  drawer_left: 'The drawer left.',
};

export default function GameView({ room, game, players, selfId, messages, onLeave }: Props) {
  const isHost = room.hostId === selfId;
  const isDrawer = game.drawerId === selfId;
  const drawer = players.find((p) => p.id === game.drawerId);
  const me = players.find((p) => p.id === selfId);
  const canDraw = isDrawer && game.phase === 'drawing';
  const canGuess = game.phase === 'drawing' && !isDrawer && !me?.hasGuessed;

  let banner: React.ReactNode;
  if (game.phase === 'choosing') banner = <span className="muted">Choosing a word…</span>;
  else if (game.word) banner = <span className="word">{game.word}</span>;
  else if (game.wordMode === 'hidden') banner = <span className="muted">Hidden word — good luck!</span>;
  else banner = <span className="word hint">{game.hint}</span>;

  const placeholder = canGuess
    ? 'Type your guess here…'
    : game.phase === 'drawing'
    ? 'Chat with others who know the word…'
    : 'Type a message…';

  return (
    <div className="game">
      <header className="game-head">
        <div className="round">Round {game.round}/{game.totalRounds}</div>
        <div className="banner">{banner}</div>
        <div className={`timer ${game.timeLeft <= 10 && game.phase === 'drawing' ? 'urgent' : ''}`}>⏱ {Math.max(0, game.timeLeft)}</div>
        <button className="btn small" onClick={onLeave}>Leave</button>
      </header>

      <aside className="side-players">
        <PlayerList
          players={players}
          selfId={selfId}
          hostId={room.hostId}
          drawerId={game.drawerId}
          showScores
          onKick={isHost ? (id, ban) => socket.emit('kick_player', { playerId: id, ban }) : undefined}
        />
      </aside>

      <main className="stage">
        <div className="canvas-stack">
          <DrawingCanvas canDraw={canDraw} />

          {game.phase === 'choosing' && (
            <div className="overlay">
              {isDrawer && game.wordOptions ? (
                <>
                  <h2>Choose a word to draw</h2>
                  <div className="row center">
                    {game.wordOptions.map((w) => (
                      <button key={w} className="btn primary big" onClick={() => socket.emit('word_chosen', { word: w })}>
                        {w}
                      </button>
                    ))}
                  </div>
                  <p className="muted">Auto-picks in {Math.max(0, game.timeLeft)}s</p>
                </>
              ) : (
                <h2>{drawer?.avatar} {drawer?.name ?? 'Someone'} is choosing a word…</h2>
              )}
            </div>
          )}

          {game.phase === 'round_end' && game.roundEnd && (
            <div className="overlay">
              <h2>{REASONS[game.roundEnd.reason] ?? 'Round over'}</h2>
              <p>The word was <b className="word">{game.roundEnd.word}</b></p>
              <ul className="score-delta">
                {[...game.roundEnd.scores]
                  .sort((a, b) => b.turnScore - a.turnScore)
                  .map((s) => (
                    <li key={s.id}>
                      <span>{s.avatar} {s.name}</span>
                      <b className={s.turnScore > 0 ? 'plus' : ''}>+{s.turnScore}</b>
                    </li>
                  ))}
              </ul>
              <p className="muted">Next turn in {Math.max(0, game.timeLeft)}s</p>
            </div>
          )}

          {game.phase === 'game_over' && game.gameOver && (
            <div className="overlay">
              <h2>🏆 {game.gameOver.winner ? `${game.gameOver.winner.name} wins!` : 'Game over'}</h2>
              <ol className="leaderboard">
                {game.gameOver.leaderboard.map((p) => (
                  <li key={p.id}>
                    <span>#{p.rank} {p.avatar} {p.name}</span>
                    <b>{p.score}</b>
                  </li>
                ))}
              </ol>
              <div className="row center">
                {isHost ? (
                  <button className="btn primary big" onClick={() => socket.emit('play_again')}>Play again</button>
                ) : (
                  <p className="muted">Waiting for the host to start another game…</p>
                )}
                <button className="btn" onClick={onLeave}>Leave room</button>
              </div>
            </div>
          )}
        </div>
        {isDrawer && game.phase === 'drawing' && <div className="drawer-note">You're drawing — only players who solved it can read your chat.</div>}
      </main>

      <aside className="side-chat">
        <Chat messages={messages} onSend={(text) => socket.emit(canGuess ? 'guess' : 'chat', { text })} placeholder={placeholder} />
      </aside>
    </div>
  );
}
