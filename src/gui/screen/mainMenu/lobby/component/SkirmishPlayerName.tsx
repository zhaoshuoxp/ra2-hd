import React, { useEffect, useState } from 'react';

export function normalizeSkirmishPlayerName(value: string, fallback = 'Player 1'): string {
    const clean = value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
    const name = [...clean].slice(0, 32).join('');
    return !name || /^@@(?:AI[1-8]|NEUTRAL)@@$/i.test(name) ? fallback : name;
}

export function SkirmishPlayerName({ name, strings, onCommit }: {
    name: string;
    strings: { get(key: string): string };
    onCommit(name: string): void;
}) {
    const [draft, setDraft] = useState(name);
    useEffect(() => setDraft(name), [name]);
    return <input type="text" className="player-name" value={draft} maxLength={64}
        aria-label={strings.get('HD:PlayerName')} data-r-tooltip={strings.get('STT:SkirmishEditPlayer')}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
            const value = normalizeSkirmishPlayerName(draft, name);
            setDraft(value);
            onCommit(value);
        }}
        onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur();
        }}/>;
}
