import { GAME_EDITIONS, type GameEdition } from '@/editions/GameEdition';
import type { ReactNode } from 'react';
import './EditionSelect.css';
interface EditionSelectProps {
    covers: Record<GameEdition, string>;
    onSelect: (edition: GameEdition) => void;
    selected?: GameEdition;
    heading?: string;
    descriptions?: Record<GameEdition, string>;
    labels?: Record<GameEdition, string>;
    languageControl?: ReactNode;
    notice?: ReactNode;
}
// Selection is presentation only. The launch coordinator must validate the entire
// edition before mounting its engine; this component cannot enable partial rules.
export function EditionSelect({ covers, onSelect, selected, heading = 'Choose your game', descriptions, labels, languageControl, notice }: EditionSelectProps) {
    return <main className="edition-select" aria-labelledby="edition-heading">
        <div className="edition-select__content">
            <header className="edition-select__header">
                <p>COMMAND &amp; CONQUER</p>
                <h1 id="edition-heading">{heading}</h1>
                {languageControl}
            </header>
            <div className="edition-select__games">
                {(['ra2', 'yr'] as const).map(id => <button key={id} type="button"
                    className={`edition-select__game edition-select__game--${id}`} data-edition={id}
                    aria-pressed={selected === id} onClick={() => onSelect(id)}>
                    <span className="edition-select__cover"><img src={covers[id]} alt="" draggable={false}/></span>
                    <span className="edition-select__caption">
                        <strong>{labels?.[id] ?? GAME_EDITIONS[id].title}</strong>
                        <span>{descriptions?.[id] ?? GAME_EDITIONS[id].subtitle}</span>
                    </span>
                </button>)}
            </div>
            {notice}
        </div>
    </main>;
}
