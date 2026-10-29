import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '../types';

interface Props {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function Chat({ messages, onSend, placeholder = 'Type a message…', disabled }: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.kind} ${m.private ? 'private' : ''}`}>
            {m.kind === 'chat' || m.kind === 'guess' ? (
              <>
                <b>{m.playerName}</b>
                {m.private && <span className="tag">private</span>}: {m.text}
              </>
            ) : (
              m.text
            )}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="chat-form">
        <input className="input" value={text} maxLength={100} disabled={disabled} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" disabled={disabled}>Send</button>
      </form>
    </div>
  );
}
