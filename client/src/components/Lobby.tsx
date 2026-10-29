import { useState } from 'react';
import { socket } from '../socket';
import type { ChatMsg, Player, RoomInfo, Settings } from '../types';
import SettingsForm from './SettingsForm';
import PlayerList from './PlayerList';
import Chat from './Chat';

interface Props {
  room: RoomInfo;
  players: Player[];
  selfId: string;
  messages: ChatMsg[];
  onLeave: () => void;
}

export default function Lobby({ room, players, selfId, messages, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === selfId;
  const me = players.find((p) => p.id === selfId);
  const link = `${window.location.origin}/?room=${room.id}`;
  const notReady = players.filter((p) => !p.isHost && !p.ready).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  return (
    <div className="center-screen">
      <div className="card lobby">
        <div className="lobby-head">
          <div>
            <h2>Lobby</h2>
            <span className="badge">{room.isPublic ? '🌐 Public' : '🔒 Private'}</span>
          </div>
          <div className="invite">
            <div className="muted small">Room code</div>
            <div className="code-display">{room.id}</div>
            <button className="btn" onClick={copy}>{copied ? 'Copied!' : '🔗 Copy invite link'}</button>
          </div>
        </div>

        <div className="lobby-grid">
          <section>
            <h3>Players ({players.length}/{room.settings.maxPlayers})</h3>
            <PlayerList
              players={players}
              selfId={selfId}
              hostId={room.hostId}
              onKick={isHost ? (id, ban) => socket.emit('kick_player', { playerId: id, ban }) : undefined}
            />
          </section>

          <section>
            <h3>Settings {!isHost && <span className="muted small">(host only)</span>}</h3>
            <SettingsForm value={room.settings} disabled={!isHost} onChange={(s: Settings) => socket.emit('update_settings', s)} />
          </section>

          <section className="lobby-chat">
            <h3>Chat</h3>
            <Chat messages={messages} onSend={(text) => socket.emit('chat', { text })} />
          </section>
        </div>

        <div className="row end">
          <button className="btn" onClick={onLeave}>Leave</button>
          {!isHost && (
            <button className={me?.ready ? 'btn success' : 'btn primary'} onClick={() => socket.emit('set_ready', { ready: !me?.ready })}>
              {me?.ready ? '✅ Ready (click to undo)' : 'Ready up'}
            </button>
          )}
          {isHost && (
            <button className="btn primary big" disabled={players.length < 2} onClick={() => socket.emit('start_game')}>
              {players.length < 2 ? 'Waiting for players…' : notReady ? `Start (${notReady} not ready)` : 'Start game'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
