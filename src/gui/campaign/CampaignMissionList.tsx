import React, { useLayoutEffect, useRef } from 'react';
import type { CampaignMission } from '../../data/campaign/CampaignMission';
import type { CampaignDifficulty } from '../../data/campaign/CampaignDefinition';
import type { CampaignFaction, CampaignPresentation } from './CampaignPresentation';
import { CampaignBackdrop } from './CampaignBackdrop';

interface Props {
    strings: any;
    presentation?: CampaignPresentation;
    missions: CampaignMission[];
    selected?: string;
    preview?: string;
    difficulty: CampaignDifficulty;
    completed: { mission: string; difficulty: CampaignDifficulty }[];
    busy: boolean;
    error?: string;
    status: string;
    onMission(filename: string): void;
    onDifficulty(difficulty: CampaignDifficulty): void;
    faction: CampaignFaction;
    factions: CampaignFaction[];
    onFaction(faction: CampaignFaction): void;
}

export function CampaignMissionList({ strings, presentation, missions, selected, preview, difficulty, completed,
    busy, error, status, onMission, onDifficulty, faction, factions, onFaction }: Props) {
    const mission = missions.find(entry => entry.filename === selected);
    const list = useRef<HTMLElement>(null);
    useLayoutEffect(() => { if (list.current) list.current.scrollTop = 0; }, [faction]);
    const button: React.CSSProperties = { font: 'inherit', color: '#ffff54', background: '#170b09e8',
        border: '1px solid #862b24', padding: '9px 12px', textAlign: 'left', cursor: 'pointer' };
    return <section data-campaign-missions data-campaign-ready={!!presentation} aria-label={strings.get('HD:CampaignSelectMission')}
        style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#ffff54', fontSize: 15 }}>
        {presentation?.backdrop && <CampaignBackdrop art={presentation.backdrop} sourceSprite={presentation.sprites.background.image}
            frame={presentation.sprites.background.hdFrame ?? presentation.sprites.background.frames[0]} logicalWidth={632} logicalHeight={568}
            style={{ inset: 8, width: 'calc(100% - 16px)', height: 'calc(100% - 16px)' }}/>}
        <div style={{ position: 'absolute', inset: '24px 24px 18px', maxWidth: 850, margin: '0 auto',
            display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto auto', gap: 12, padding: 18, boxSizing: 'border-box', background: '#080604df', border: '1px solid #862b24' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>{strings.get('HD:CampaignSelectMission')}</h2>
                <select data-campaign-mission-faction aria-label={strings.get('GUI:SelectCampaign')} value={faction} disabled={busy}
                    onChange={event => onFaction(event.target.value as CampaignFaction)}
                    style={{ ...button, maxWidth: '52%', height: 36, padding: '4px 10px', lineHeight: 'normal' }}>
                    {factions.map(value => <option key={value} value={value}>{strings.get({ allied: 'GUI:AlliedCampaign',
                        soviet: 'GUI:SovietCampaign', tutorial: 'GUI:TutorialCampaign' }[value])}</option>)}
                </select>
            </header>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, .9fr) minmax(220px, 1.3fr)', gap: 18, minHeight: 0 }}>
                <nav ref={list} data-campaign-mission-list aria-label={strings.get('HD:CampaignSelectMission')} style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', paddingRight: 4 }}>
                    {missions.map(entry => <button key={entry.filename} type="button" data-campaign-mission={entry.filename}
                        data-playable={entry.playable} aria-pressed={entry.filename === selected} disabled={busy}
                        onClick={() => onMission(entry.filename)} style={{ ...button, borderColor: entry.filename === selected ? '#ffb137' : '#862b24',
                            color: entry.playable ? '#ffff54' : '#c0a48b' }}>
                        <span>{String(entry.number).padStart(2, '0')} · {strings.get(entry.title)}</span>
                        <small style={{ display: 'block', marginTop: 3, fontSize: 12 }}>
                            {entry.playable ? strings.get(completed.some(row => row.mission === entry.filename && row.difficulty === difficulty)
                                ? 'HD:CampaignMissionComplete' : 'HD:CampaignMissionAvailable') : strings.get('HD:CampaignMissionUnavailable')}
                        </small>
                    </button>)}
                </nav>
                <article style={{ minHeight: 0, overflowY: 'auto' }}>
                    {preview && <img data-campaign-preview src={preview} alt={mission ? strings.get(mission.title) : ''}
                        style={{ display: 'block', width: '100%', aspectRatio: '800 / 520', objectFit: 'contain', background: '#000', border: '1px solid #862b24' }}/>}
                    {mission && <><h3 style={{ fontSize: 18, margin: '12px 0 8px' }}>{strings.get(mission.title)}</h3>
                        <p data-campaign-briefing style={{ margin: 0, whiteSpace: 'pre-line', lineHeight: 1.45, color: '#efdbb0' }}>
                            {strings.get(mission.briefing).replace(/\\n/g, '\n')}
                        </p></>}
                </article>
            </div>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                <legend style={{ float: 'left', marginRight: 12 }}>{strings.get('GUI:Difficulty')}</legend>
                {(['easy', 'normal', 'hard'] as const).map(value => <button key={value} type="button" data-campaign-difficulty-choice={value}
                    aria-pressed={difficulty === value} onClick={() => onDifficulty(value)}
                    style={{ ...button, borderColor: difficulty === value ? '#ffb137' : '#862b24', textAlign: 'center', flex: 1 }}>
                    {strings.get('TXT_' + value.toUpperCase())}
                    {completed.some(row => row.mission === selected && row.difficulty === value) ? ' ✓' : ''}
                </button>)}
            </fieldset>
            <p role={error ? 'alert' : 'status'} data-campaign-status style={{ margin: 0, minHeight: 18, fontSize: 13, color: error ? '#ffd6be' : '#e6c784' }}>{error ?? status}</p>
        </div>
    </section>;
}
