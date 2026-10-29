import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import type { ChatMsg, GameState, Player, RoomInfo } from './types';
import Home from './components/Home';
import Lobby from './components/Lobby';
import GameView from './components/GameView';

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [selfId, setSelfId] = useState('');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [game, setGame] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [notice, setNotice] = useState('');
  const msgId = useRef(0);

  const resetToHome = useCallback((message = '') => {
    setRoom(null);
    setGame(null);
    setPlayers([]);
    setMessages([]);
    setNotice(message);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    const addMsg = (m: Omit<ChatMsg, 'id'>) =>
      setMessages((prev) => [...prev.slice(-199), { ...m, id: ++msgId.current }]);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      resetToHome('Connection lost. Please rejoin.');
    };
    const onRoomUpdate = (r: RoomInfo) => {
      setRoom(r);
      setPlayers(r.players);
    };
    const onPlayers = ({ players }: { players: Player[] }) => setPlayers(players);
    const onGameState = (g: GameState) => {
      setGame(g);
      setPlayers(g.players);
    };
    const onTimer = ({ timeLeft }: { timeLeft: number }) => setGame((g) => (g ? { ...g, timeLeft } : g));
    const onHint = ({ hint }: { hint: string }) => setGame((g) => (g ? { ...g, hint } : g));
    const onKicked = ({ reason }: { reason: string }) => resetToHome(reason);
    const onError = ({ message }: { message: string }) => {
      addMsg({ kind: 'system', text: message });
      setNotice(message);
      setTimeout(() => setNotice(''), 3000);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_update', onRoomUpdate);
    socket.on('player_joined', onPlayers);
    socket.on('player_left', onPlayers);
    socket.on('game_state', onGameState);
    socket.on('timer', onTimer);
    socket.on('hint', onHint);
    socket.on('chat_message', addMsg);
    socket.on('kicked', onKicked);
    socket.on('error_message', onError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_update', onRoomUpdate);
      socket.off('player_joined', onPlayers);
      socket.off('player_left', onPlayers);
      socket.off('game_state', onGameState);
      socket.off('timer', onTimer);
      socket.off('hint', onHint);
      socket.off('chat_message', addMsg);
      socket.off('kicked', onKicked);
      socket.off('error_message', onError);
    };
  }, [resetToHome]);

  const handleEntered = (id: string, r: RoomInfo) => {
    setSelfId(id);
    setRoom(r);
    setPlayers(r.players);
    setMessages([]);
    setNotice('');
    window.history.replaceState({}, '', `?room=${r.id}`);
  };

  const leave = () => {
    socket.emit('leave_room');
    resetToHome();
  };

  if (!connected) {
    return (
      <div className="center-screen">
        <div className="card">
          <h2>Connecting to server…</h2>
          <p className="muted">If the server was asleep (free hosting), this can take up to a minute.</p>
        </div>
      </div>
    );
  }

  if (!room) return <Home onEntered={handleEntered} notice={notice} />;

  const inGame = game && game.phase !== 'lobby';
  return (
    <>
      {notice && <div className="toast">{notice}</div>}
      {inGame ? (
        <GameView room={room} game={game} players={players} selfId={selfId} messages={messages} onLeave={leave} />
      ) : (
        <Lobby room={room} players={players} selfId={selfId} messages={messages} onLeave={leave} />
      )}
    </>
  );
}
