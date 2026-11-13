import React, { useEffect, useRef, useState } from 'react';
import type { CampaignDifficulty } from '../../data/campaign/CampaignDefinition';
import type { CampaignFaction, CampaignPresentation, CampaignSprite } from './CampaignPresentation';
import { CampaignArrows, CampaignChrome } from './CampaignChrome';
import { CampaignBackdrop } from './CampaignBackdrop';
import { campaignAnimationFrame } from './CampaignAnimation';

export function CampaignSpriteCanvas({ sprite, active = false, animation, style, heated = false }: {
    sprite: CampaignSprite; active?: boolean; animation?: CampaignPresentation['animation']; style?: React.CSSProperties; heated?: boolean;
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    const [vectorFrame, setVectorFrame] = useState(0);
    useEffect(() => {
        const canvas = ref.current, context = canvas?.getContext('2d');
        const started = performance.now();
        let pending = 0, previous = -1;
        const draw = (time: number) => {
            const index = active && animation
                ? campaignAnimationFrame(time, started, animation) : 0;
            if (index !== previous) {
                if (sprite.vectors) setVectorFrame(index);
                else if (canvas && context) {
                    context.putImageData(sprite.hdFrame ?? sprite.frames[index], 0, 0);
                    canvas.dataset.frame = String(index);
                }
                previous = index;
            }
            if (active) pending = requestAnimationFrame(draw);
        };
        draw(started);
        return () => cancelAnimationFrame(pending);
    }, [sprite, active, animation]);
    const chrome = ['ttlbr800.shp', 'spldbrl.shp', 'spldbr.shp'].includes(sprite.image);
    const vectorWidth = chrome && typeof style?.width === 'number' ? style.width : sprite.width;
    if (sprite.vectors) return <svg width={vectorWidth} height={sprite.height} viewBox={`0 0 ${vectorWidth} ${sprite.height}`}
        data-campaign-sprite={sprite.image} data-frame={vectorFrame} data-art-density="vector"
        style={{ display: 'block', width: sprite.width, height: sprite.height, ...style }}>
        {chrome ? <CampaignChrome image={sprite.image} width={vectorWidth} housing={sprite.hdHousing} heated={heated}/>
            : <CampaignArrows image={sprite.image} frame={vectorFrame}/>}
    </svg>;
    return <canvas ref={ref} width={sprite.hdFrame?.width ?? sprite.width} height={sprite.hdFrame?.height ?? sprite.height}
        data-campaign-sprite={sprite.image} data-art-density={sprite.hdFrame ? 2 : 1}
        style={{ display: 'block', width: sprite.width, height: sprite.height, ...style }}/>;
}

interface CampaignSelectionProps {
    strings: any;
    presentation?: CampaignPresentation;
    status: string;
    error?: string;
    busy: boolean;
    difficulty: CampaignDifficulty;
    onSelect(faction: CampaignFaction): void;
    onHover?(faction: CampaignFaction): void;
    onDifficulty(difficulty: CampaignDifficulty): void;
    factions?: CampaignFaction[];
}

export function CampaignSelection({ strings, presentation, status, error, busy, difficulty, onSelect, onHover, onDifficulty,
    factions = ['allied', 'tutorial', 'soviet'] }: CampaignSelectionProps) {
    const [hovered, setHovered] = useState<CampaignFaction>();
    const [focused, setFocused] = useState<CampaignFaction>();
    const difficulties: CampaignDifficulty[] = ['easy', 'normal', 'hard'];
    const labels = { allied: 'GUI:AlliedCampaign', tutorial: 'GUI:TutorialCampaign', soviet: 'GUI:SovietCampaign' };
    const tooltip = { allied: 'STT:CampaignAnimAllied', tutorial: 'STT:CampaignAnimTutorial', soviet: 'STT:CampaignAnimSoviet' };
    return <section data-campaign-selection data-campaign-presentation="retail" data-campaign-ready={!!presentation}
        data-campaign-art-density={presentation?.hd ? '2' : '1'}
        aria-label={strings.get('GUI:SelectCampaign')}
        style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#ffff54', fontSize: 15 }}>
        {presentation?.backdrop && <CampaignBackdrop art={presentation.backdrop}
            sourceSprite={presentation.sprites.background.image}
            frame={presentation.sprites.background.hdFrame ?? presentation.sprites.background.frames[0]} logicalWidth={632} logicalHeight={568}
            style={{ inset: 8, width: 'calc(100% - 16px)', height: 'calc(100% - 16px)' }}/>}
        <div data-campaign-selection-content style={{ position: 'relative', width: 632, height: 568 }}>
        {presentation && <>
            {!presentation.backdrop && <CampaignSpriteCanvas sprite={presentation.sprites.background} style={{ clipPath: 'inset(8px)' }}/>}
            {factions.map(faction => {
                const sprite = presentation.sprites[faction], anchor = presentation.anchors[faction];
                return <button key={faction} type="button" data-campaign-faction={faction} aria-label={strings.get(labels[faction])}
                    title={strings.get(tooltip[faction])} aria-describedby="campaign-availability" disabled={busy}
                    onMouseEnter={() => { setHovered(faction); setFocused(undefined); onHover?.(faction); }} onMouseLeave={() => setHovered(undefined)}
                    onPointerDown={() => setFocused(undefined)}
                    onFocus={event => { if (event.currentTarget.matches(':focus-visible')) {
                        setHovered(undefined); setFocused(faction); onHover?.(faction);
                    } }}
                    onBlur={() => setFocused(undefined)} onClick={() => { setFocused(undefined); onSelect(faction); }}
                    style={{ position: 'absolute', left: anchor.x, top: anchor.y, width: sprite.width, height: sprite.height,
                        margin: 0, padding: 0, border: 0, outline: 0, background: 'transparent', cursor: busy ? 'wait' : 'pointer' }}>
                    <CampaignSpriteCanvas sprite={sprite} active={(hovered ?? focused) === faction} animation={presentation.animation}/>
                </button>;
            })}
            <label htmlFor="campaign-difficulty" style={{ position: 'absolute', left: 180, top: 468 }}>{strings.get('GUI:Difficulty')}</label>
            <span style={{ position: 'absolute', right: 172, top: 468 }}>{strings.get('GUI:Harder')}</span>
            <input id="campaign-difficulty" data-campaign-difficulty type="range" min={0} max={2} step={1}
                aria-valuetext={strings.get('TXT_' + difficulty.toUpperCase())} value={difficulties.indexOf(difficulty)} disabled={busy}
                onChange={event => onDifficulty(difficulties[Number(event.target.value)])}
                style={{ position: 'absolute', left: 180, top: 499, width: 280,
                    '--campaign-grip': `url("${presentation.slider.grip}")`, '--campaign-track-left': `url("${presentation.slider.left}")`,
                    '--campaign-track-right': `url("${presentation.slider.right}")`, '--campaign-track-middle': `url("${presentation.slider.middle}")` } as React.CSSProperties}/>
            <span data-campaign-difficulty-label style={{ position: 'absolute', left: 180, top: 522, width: 280, textAlign: 'center', fontSize: 13 }}>
                {strings.get('TXT_' + difficulty.toUpperCase())}
            </span>
            <style>{`
                #campaign-difficulty::-webkit-slider-runnable-track {
                    height: 24px; border: 0;
                    background-image: var(--campaign-track-left), var(--campaign-track-right), var(--campaign-track-middle);
                    background-position: left center, right center, center; background-repeat: no-repeat, no-repeat, repeat-x;
                }
                #campaign-difficulty::-webkit-slider-thumb {
                    width: 14px; height: 24px; border: 0; background: var(--campaign-grip) center / contain no-repeat;
                }
            `}</style>
        </>}
        <p id="campaign-availability" role="status" data-campaign-status style={{ position: 'absolute', left: 16, right: 16, bottom: 5,
            margin: 0, fontSize: 12, lineHeight: 1.3, color: '#e6c784', textAlign: 'center' }}>{status}</p>
        {error && <p role="alert" style={{ position: 'absolute', left: 24, right: 24, top: 24, padding: 16,
            background: '#200', color: '#ffd6be', overflowWrap: 'anywhere' }}>{error}</p>}
        </div>
    </section>;
}
