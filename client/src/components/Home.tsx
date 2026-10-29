import { useCallback, useEffect, useState } from 'react';
import { socket } from '../socket';
import { DEFAULT_SETTINGS } from '../types';
import type { PublicRoom, RoomInfo, Settings } from '../types';
import SettingsForm from './SettingsForm';

interface Props {
  onEntered: (selfId: string, room: RoomInfo) => void;
  notice: string;
}

type Tab = 'join' | 'create' | 'public';
type Ack = { ok: boolean; error?: string; selfId?: string; room?: RoomInfo };

export default function Home({ onEntered, notice }: Props) {
  const urlRoom = new URLSearchParams(window.location.search).get('room') ?? '';
  const [name, setName] = useState(() => localStorage.getItem('skribbl:name') ?? '');
  const [tab, setTab] = useState<Tab>(urlRoom ? 'join' : 'create');
  const [code, setCode] = useState(urlRoom.toUpperCase());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isPublic, setIsPublic] = useState(false);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    socket.emit('list_rooms', (res: { ok: boolean; rooms: PublicRoom[] }) => res?.ok && setRooms(res.rooms));
  }, []);

  useEffect(() => {
    if (tab === 'public') refresh();
  }, [tab, refresh]);

  const handle = (res: Ack) => {
    setBusy(false);
    if (res.ok && res.selfId && res.room) onEntered(res.selfId, res.room);
    else setError(res.error ?? 'Something went wrong');
  };

  const needName = () => {
    if (!name.trim()) {
      setError('Please enter a nickname first.');
      return false;
    }
    localStorage.setItem('skribbl:name', name.trim());
    setError('');
    return true;
  };

  const create = () => {
    if (!needName()) return;
    setBusy(true);
    socket.emit('create_room', { hostName: name, settings, isPublic }, handle);
  };
  const join = (roomId = code) => {
    if (!needName()) return;
    if (!roomId.trim()) return setError('Enter a room code.');
    setBusy(true);
    socket.emit('join_room', { roomId, playerName: name }, handle);
  };
  const quickPlay = () => {
    if (!needName()) return;
    setBusy(true);
    socket.emit('quick_play', { playerName: name }, handle);
  };

  return (
    <div className="center-screen">
      <div className="card home">
        <h1 className="logo">
          <span>🎨</span> Scribble Party
        </h1>
        <p className="muted">Draw, guess, laugh. Create a room and share the link with friends.</p>

        <input className="input big" placeholder="Your nickname" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />

        <div className="tabs">
          {(['create', 'join', 'public'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
              {t === 'create' ? 'Create room' : t === 'join' ? 'Join with code' : 'Public rooms'}
            </button>
          ))}
        </div>

        {tab === 'create' && (
          <>
            <SettingsForm value={settings} onChange={setSettings} />
            <label className="check">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              List this room publicly (otherwise it's invite-only via link/code)
            </label>
            <button className="btn primary big" disabled={busy} onClick={create}>
              Create room
            </button>
          </>
        )}

        {tab === 'join' && (
          <>
            <input
              className="input big code"
              placeholder="ROOM CODE"
              maxLength={5}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
            <button className="btn primary big" disabled={busy} onClick={() => join()}>
              Join room
            </button>
          </>
        )}

        {tab === 'public' && (
          <>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={quickPlay}>
                ⚡ Quick play
              </button>
              <button className="btn" onClick={refresh}>
                Refresh
              </button>
            </div>
            <div className="room-list">
              {rooms.length === 0 && <p className="muted">No public rooms right now — create one!</p>}
              {rooms.map((r) => (
                <div key={r.id} className="room-row">
                  <div>
                    <b>{r.host}'s room</b>
                    <div className="muted small">
                      {r.players}/{r.maxPlayers} players · {r.rounds} rounds · {r.drawTime}s · {r.phase === 'lobby' ? 'in lobby' : 'in game'}
                    </div>
                  </div>
                  <button className="btn" disabled={busy} onClick={() => join(r.id)}>
                    Join
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
