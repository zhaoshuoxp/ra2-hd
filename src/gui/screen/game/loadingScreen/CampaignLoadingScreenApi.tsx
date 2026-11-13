import React, { useLayoutEffect, useRef, useState } from 'react';
import { jsx } from '../../../jsx/jsx';
import { HtmlView } from '../../../jsx/HtmlView';
import { loadPreparedCampaign } from '../../../../offline/campaign';
import { loadCampaignPresentation, type CampaignPresentation } from '../../../campaign/CampaignPresentation';
import { CampaignSpriteCanvas } from '../../../campaign/CampaignSelection';
import { CampaignBackdrop } from '../../../campaign/CampaignBackdrop';
import { CampaignLoadingProgress } from '../../../campaign/CampaignLoadingProgress';
import type { LoadingScreenApi } from './LoadingScreenApi';

function CampaignLoadingScreen({ presentation, strings, viewport, percent, color }: any) {
    const { sprites, loading } = presentation as CampaignPresentation;
    const root = useRef<HTMLElement>(null), [protectedTop, setProtectedTop] = useState(0);
    useLayoutEffect(() => {
        const resize = () => {
            const bounds = root.current?.getBoundingClientRect();
            if (!bounds?.width) return;
            const physicalTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ra2-safe-top')) || 0;
            const inset = Math.max(0, physicalTop - bounds.top) / (bounds.width / viewport.width);
            setProtectedTop(Math.min(viewport.height / 4, inset));
        };
        resize(); const frame = requestAnimationFrame(resize);
        window.addEventListener('resize', resize); window.addEventListener('ra2-display-safe-area', resize);
        return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize);
            window.removeEventListener('ra2-display-safe-area', resize); };
    }, [viewport.width, viewport.height]);
    const availableHeight = viewport.height - protectedTop;
    const scale = Math.min(viewport.width / loading.width, availableHeight / loading.height);
    const width = viewport.width / scale, height = availableHeight / scale;
    const imageX = (width - loading.width) / 2, imageY = (height - sprites.mission.height) / 2;
    const housingWidth = width;
    const flow = presentation.hd?.briefingFlow;
    const briefingRight = presentation.mission === 'sov06lmd.map' ? 175 : 225;
    const briefingWidth = flow?.width ?? (presentation.edition === 'yr'
        ? Math.max(80, briefingRight - loading.briefX) : loading.width - 40);
    return <section ref={root} data-campaign-loading data-campaign-loading-source={sprites.mission.image} data-percent={percent}
        data-protected-top={protectedTop}
        data-campaign-art-density={presentation.hd ? '2' : '1'}
        style={{ position: 'absolute', left: 0, top: 0, width: viewport.width, height: viewport.height, background: '#000' }}>
        <div data-campaign-loading-frame style={{ position: 'absolute', width, height, left: 0, top: protectedTop,
            transform: `scale(${scale})`, transformOrigin: 'top left', color, fontSize: 16 }}>
            {presentation.backdrop ? <CampaignBackdrop art={presentation.backdrop}
                sourceSprite={sprites.mission.image} foreground
                frame={sprites.mission.hdFrame ?? sprites.mission.frames[0]} logicalWidth={800} logicalHeight={520}/>
                : <CampaignSpriteCanvas sprite={sprites.mission} style={{ position: 'absolute', left: imageX, top: imageY }}/>}
            <CampaignSpriteCanvas sprite={sprites.title} style={{ position: 'absolute', left: 0, top: 0, width, zIndex: 1 }}/>
            <div role="progressbar" aria-label={strings.get('GUI:LoadingEx')} aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={Math.floor(percent)} style={{ position: 'absolute', left: 0,
                    top: height - 40, width: housingWidth, height: 40, zIndex: 3 }}>
                <CampaignLoadingProgress width={housingWidth} percent={percent} housing={presentation.hd?.housing}
                    originalFrame={sprites.progressHousing.frames[0]} originalFillFrame={sprites.progressFill.frames[0]}/>
            </div>
            <div data-campaign-load-message style={{ position: 'absolute', left: 12, right: 12, top: 9,
                zIndex: 4, textAlign: 'center', whiteSpace: 'nowrap' }}>
                {strings.get(loading.loadMessage)}
            </div>
            <div data-campaign-load-briefing style={{ position: 'absolute', left: imageX + loading.briefX,
                top: imageY + loading.briefY - loading.imageY, width: briefingWidth,
                fontSize: presentation.edition === 'yr' ? 14 : undefined,
                whiteSpace: 'pre-line', lineHeight: 1.35, textShadow: '1px 1px 1px #000' }}>
                {flow && <span aria-hidden data-campaign-briefing-exclusion style={{ float: 'right', width: flow.width,
                    height: flow.height, shapeOutside: flow.shape, shapeMargin: 6 }}/>}<span data-campaign-briefing-text>
                    {strings.get(loading.briefing).replace(/\\n/g, '\n')}
                </span>
            </div>
        </div>
    </section>;
}

export class CampaignLoadingScreenApi implements LoadingScreenApi {
    private disposed = false;
    private percent = 0;
    private object?: any;
    private view?: any;
    private presentation?: CampaignPresentation;
    private mission = 'sov01t.map';
    private edition: 'ra2' | 'yr' = 'ra2';
    constructor(private readonly rules: any, private readonly strings: any,
        private readonly uiScene: any, private readonly jsxRenderer: any) {}

    setCampaignMission(mission: string, edition: 'ra2' | 'yr'): void { this.mission = mission; this.edition = edition; }
    async start(): Promise<void> {
        const prepared = await loadPreparedCampaign(this.mission, this.edition);
        const presentation = await loadCampaignPresentation(prepared.manifest, 'loading');
        if (this.disposed) { presentation.dispose(); return; }
        this.presentation = presentation;
        const [object] = this.jsxRenderer.render(jsx(HtmlView, { width: '100%', height: '100%', component: CampaignLoadingScreen,
            innerRef: (view: any) => this.view = view,
            props: { presentation, strings: this.strings, viewport: this.uiScene.menuViewport, percent: this.percent,
                color: this.rules.colors.get(this.mission.startsWith('sov') ? 'SovietLoad' : 'AlliedLoad')?.asHexString() ?? '#ff0000' } }));
        this.object = object;
        this.uiScene.add(object);
        // Let the real loading screen paint before CPU preparation starts.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    onLoadProgress(percent: number): void {
        if (this.disposed || !Number.isFinite(percent)) return;
        this.percent = Math.max(this.percent, Math.min(100, Math.max(0, percent)));
        this.view?.applyOptions((options: any) => options.percent = this.percent);
    }
    updateViewport(): void {
        this.view?.applyOptions((options: any) => options.viewport = this.uiScene.menuViewport);
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.object) { this.uiScene.remove(this.object); this.object.destroy(); }
        this.presentation?.dispose();
        this.object = this.view = this.presentation = undefined;
    }
}
