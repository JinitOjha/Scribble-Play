import { useEffect, useState } from 'react';
import { CATEGORIES } from '../types';
import type { Settings, WordMode } from '../types';

interface Props {
  value: Settings;
  onChange: (s: Settings) => void;
  disabled?: boolean;
}

export default function SettingsForm({ value, onChange, disabled }: Props) {
  const [customText, setCustomText] = useState(value.customWords.join(', '));
  useEffect(() => setCustomText(value.customWords.join(', ')), [value.customWords]);

  const set = <K extends keyof Settings>(key: K, v: Settings[K]) => onChange({ ...value, [key]: v });
  const commitCustom = () =>
    set(
      'customWords',
      customText
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean)
    );

  const slider = (label: string, key: 'maxPlayers' | 'rounds' | 'drawTime' | 'wordCount' | 'hints', min: number, max: number, step = 1, unit = '') => (
    <label className="setting">
      <span>
        {label} <b>{value[key]}{unit}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value[key]} disabled={disabled} onChange={(e) => set(key, Number(e.target.value))} />
    </label>
  );

  return (
    <div className="settings">
      {slider('Max players', 'maxPlayers', 2, 20)}
      {slider('Rounds', 'rounds', 2, 10)}
      {slider('Draw time', 'drawTime', 15, 240, 5, 's')}
      {slider('Word choices', 'wordCount', 1, 5)}
      {slider('Hints', 'hints', 0, 5)}
      <label className="setting">
        <span>Word mode</span>
        <select value={value.wordMode} disabled={disabled} onChange={(e) => set('wordMode', e.target.value as WordMode)}>
          <option value="normal">Normal</option>
          <option value="hidden">Hidden (no hints)</option>
          <option value="combination">Combination (two words)</option>
        </select>
      </label>
      <label className="setting">
        <span>Category</span>
        <select value={value.category} disabled={disabled} onChange={(e) => set('category', e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="setting full">
        <span>Custom words (comma separated)</span>
        <textarea
          rows={2}
          value={customText}
          disabled={disabled}
          placeholder="e.g. sandcastle, skateboard, moon"
          onChange={(e) => setCustomText(e.target.value)}
          onBlur={commitCustom}
        />
      </label>
    </div>
  );
}
