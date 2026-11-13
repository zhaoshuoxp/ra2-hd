import React, { useEffect, useRef, useState } from 'react';
import { campaignRanking, campaignSkipsScore, scoreText, scoreTime } from './CampaignScoreModel';
import { drawScoreSprite, type CampaignScorePresentation } from './CampaignScorePresentation';
import { paintCampaignBackdrop, sizeCampaignBackdrop } from './CampaignBackdrop';
import { campaignAnimationFrame } from './CampaignAnimation';

export const CAMPAIGN_SCORE_SCALE = .78;

interface CampaignResultProps {
    game: any; player: any; strings: any; presentation: CampaignScorePresentation;
    playEmblemSound?: () => { stop(): void } | undefined;
    error?: string;
}

export function CampaignResult(props: CampaignResultProps) {
    if (campaignSkipsScore(props.game.campaign)) {
        const victory = props.game.campaign.result === 'victory';
        return <section data-campaign-result={victory ? 'victory' : 'defeat'} data-campaign-score="skipped"
            data-score-phase="complete" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
            <div style={{ padding: '28px 36px', maxWidth: 520, color: '#ffff54', background: '#080604df', border: '1px solid #862b24' }}>
                <h2 style={{ margin: '0 0 16px', fontSize: 24 }}>{props.strings.get(victory ? 'HD:MissionAccomplished' : 'HD:MissionFailed')}</h2>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{props.strings.get(victory
                    ? 'GUI:TutorialCampaign' : 'HD:CampaignRetryHint')}</p>
                {props.error && <p role="alert" style={{ color: '#ffd6be' }}>{props.error}</p>}
            </div>
        </section>;
    }
    return <CampaignScoredResult {...props}/>;
}

function CampaignScoredResult({ game, player, strings, presentation, playEmblemSound, error }: CampaignResultProps) {
    const victory = game.campaign.result === 'victory', canvas = useRef<HTMLCanvasElement>(null);
    const [elapsed, setElapsed] = useState(0), skipped = useRef(false);
    const playedSeconds = (game.campaign.playTime?.elapsedMs ?? game.currentTime) / 1000;
    const ranking = campaignRanking(game.campaign.definition, game.campaign.launch.difficulty, playedSeconds);
    const title = strings.get(victory ? ranking.title : 'HD:MissionFailed');
    const message = strings.get(victory ? ranking.message : 'HD:CampaignRetryHint');
    const openMs = presentation.panel.openingFrames.length * 1000 / presentation.framesPerSecond;
    const messageStart = openMs + Array.from(title).length * 32 + 220;
    const tallyStart = messageStart + Array.from(message).length * 32 + 220, doneMs = tallyStart + 1200;
    useEffect(() => {
        const surface = canvas.current!, context = surface.getContext('2d', { willReadFrequently: true })!, started = performance.now();
        const scratch = document.createElement('canvas');
        let pending = 0, previous = '', sound: { stop(): void } | undefined, soundStarted = false;
        let width = 632, height = 568;
        const resize = () => {
            width = presentation.backdrop ? surface.clientWidth : 632;
            height = presentation.backdrop ? surface.clientHeight : 568;
            if (presentation.backdrop) sizeCampaignBackdrop(surface, width, height);
            previous = '';
        };
        const observer = new ResizeObserver(resize); observer.observe(surface); resize();
        const draw = (time: number) => {
            const actual = time - started, phase = skipped.current ? Math.max(doneMs, actual) : actual;
            const panelFrame = campaignAnimationFrame(phase, 0, { activeFrames: presentation.panel.openingFrames,
                framesPerSecond: presentation.framesPerSecond }, false);
            const emblemFrame = phase >= openMs && victory
                ? Math.floor((phase - openMs) * presentation.framesPerSecond / 1000) % presentation.sprites.emblem.numImages : -1;
            const key = panelFrame + ':' + emblemFrame;
            if (key !== previous) {
                context.clearRect(0, 0, width, height);
                if (presentation.backdrop) paintCampaignBackdrop(context, presentation.backdrop, width, height);
                context.save();
                if (presentation.backdrop) {
                    context.translate(width / 2, height / 2);
                    context.scale(CAMPAIGN_SCORE_SCALE, CAMPAIGN_SCORE_SCALE); context.translate(-316, -284);
                }
                if (!presentation.backdrop) drawScoreSprite(context, scratch, presentation.sprites.background, presentation.palette, 0, 0, 0);
                if (victory) {
                    drawScoreSprite(context, scratch, presentation.sprites.panel, presentation.palette, panelFrame,
                        presentation.panel.x, presentation.panel.y, presentation.backdrop ? { panel: presentation.sprites.panel, kind: 'panel' } : undefined);
                    if (emblemFrame >= 0) drawScoreSprite(context, scratch, presentation.sprites.emblem, presentation.palette, emblemFrame,
                        presentation.emblem.x, presentation.emblem.y, presentation.backdrop ? { panel: presentation.sprites.panel, kind: 'emblem' } : undefined);
                }
                context.restore();
                canvas.current!.dataset.panelFrame = String(panelFrame);
                canvas.current!.dataset.emblemFrame = String(emblemFrame);
                previous = key;
            }
            if (victory && phase >= openMs && !soundStarted) { soundStarted = true; sound = playEmblemSound?.(); }
            setElapsed(phase);
            pending = requestAnimationFrame(draw);
        };
        pending = requestAnimationFrame(draw);
        return () => { cancelAnimationFrame(pending); observer.disconnect(); sound?.stop(); scratch.width = scratch.height = 0; };
    }, [presentation, victory, openMs, doneMs, playEmblemSound]);
    const tally = Math.min(1, Math.max(0, (elapsed - tallyStart) / 1200));
    const textStyle: React.CSSProperties = { position: 'absolute', margin: 0, fontSize: 16, lineHeight: '20px',
        color: '#ffff54', whiteSpace: 'pre-wrap', textShadow: '1px 1px #000' };
    return <section data-campaign-result={victory ? 'victory' : 'defeat'} data-campaign-score="retail"
        data-score-phase={elapsed < openMs ? 'opening' : elapsed < doneMs ? 'text' : 'complete'}
        data-score-art-density="original" style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}
        onClick={() => skipped.current = true} onKeyDown={event => {
            if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); skipped.current = true; }
        }} tabIndex={0} aria-label={strings.get('GUI:StandaloneScore')}>
        {presentation.backdrop && <canvas ref={canvas} data-campaign-backdrop={presentation.backdrop.revision} aria-hidden="true"
            style={{ position: 'absolute', inset: 8, width: 'calc(100% - 16px)', height: 'calc(100% - 16px)', pointerEvents: 'none' }}/>}
        <div data-campaign-result-content data-score-content-scale={CAMPAIGN_SCORE_SCALE}
            style={{ position: 'relative', width: 632, height: 568, transform: `scale(${CAMPAIGN_SCORE_SCALE})` }}>
        {!presentation.backdrop && <canvas ref={canvas} width={632} height={568} aria-hidden="true" style={{ display: 'block', clipPath: 'inset(8px)' }}/>}
        <p data-score-title style={{ ...textStyle, left: 124, top: 67, width: 385 }}>{scoreText(title, elapsed, openMs)}</p>
        <p data-score-message style={{ ...textStyle, left: 124, top: 91, width: 385, minHeight: 65 }}>
            {scoreText(message, elapsed, messageStart)}
        </p>
        {victory && elapsed >= tallyStart && <>
            <p style={{ ...textStyle, left: 124, top: 172, width: 170 }}>{strings.get('GUI:HeadsTaken')}</p>
            <p data-score-kills style={{ ...textStyle, left: 296, top: 172 }}>{Math.floor(player.getUnitsKilled() * tally)}</p>
            {[{ x: 184, label: 'GUI:ParTime', seconds: ranking.parSeconds },
                { x: 359, label: 'GUI:YourTime', seconds: playedSeconds }].map(item => <div key={item.label}>
                <p style={{ ...textStyle, left: item.x - 15, top: 442, width: 114, textAlign: 'center' }}>{strings.get(item.label)}</p>
                <p data-score-time={item.label} style={{ ...textStyle, left: item.x - 15, top: 460, width: 114, textAlign: 'center' }}>
                    {scoreTime(item.seconds * tally)}
                </p>
            </div>)}
        </>}
        </div>
        {error && <p role="alert" style={{ position: 'absolute', bottom: 12, margin: 8, color: '#ffd6be' }}>{error}</p>}
    </section>;
}
