import { currentCampaignSubtitle, type CampaignSubtitleCue } from './CampaignSubtitles';
import { campaignMoviePauses, type CampaignMoviePlacement } from '../../data/campaign/CampaignMoviePolicy';
import { movieTime, type MovieTimePoint } from './MovieTimeline';

export type CampaignMediaOutcome = 'ended' | 'skipped' | 'cancelled';
export interface CampaignMediaSource {
    url: string;
    kind: 'original' | 'hd';
    timeline?: readonly MovieTimePoint[];
    subtitleStrategy?: 'game' | 'none' | 'burned-in';
    fallback?: () => Promise<CampaignMediaSource>;
}
export interface CampaignMediaRequest {
    id: string;
    url: string;
    placement: CampaignMoviePlacement;
    subtitle?: string;
    subtitles?: readonly CampaignSubtitleCue[];
    skipLabel: string;
    startTime?: number;
    source?: () => Promise<CampaignMediaSource>;
}
interface PendingMedia { request: CampaignMediaRequest; resolve(value: CampaignMediaOutcome): void; reject(error: Error): void }

// Media completion and cancellation settle callers independently of simulation time.
export class CampaignMediaPlayer {
    private queue: PendingMedia[] = [];
    private current?: { request: CampaignMediaRequest; video: HTMLVideoElement; source?: CampaignMediaSource;
        time(): number; fail(error: Error): void; settle(outcome: CampaignMediaOutcome, error?: Error): void };
    private waiting?: PendingMedia;
    private disposed = false;
    private paused = false;
    private playbackRevision = 0;
    private fullscreenActive = false;
    private audioActive = false;
    private inflight = new Map<string, Promise<CampaignMediaOutcome>>();
    readonly outcomes: { id: string; outcome: CampaignMediaOutcome }[] = [];
    constructor(private readonly onFullscreen: (active: boolean) => void = () => {},
        private readonly volume: () => number = () => 1, private readonly onAudioActive: (active: boolean) => void = () => {},
        private readonly transmissionHost: () => HTMLElement | undefined = () => undefined,
        private readonly pauseQueuedFullscreen = false,
        private readonly beforeStart?: (request: CampaignMediaRequest) => Promise<void> | undefined) {}

    play(request: CampaignMediaRequest): Promise<CampaignMediaOutcome> {
        if (this.disposed) return Promise.reject(new Error('Campaign media player is disposed'));
        const existing = this.inflight.get(request.id);
        if (existing) return existing;
        if (this.queue.length >= 64) return Promise.reject(new Error('Campaign media queue exceeded its limit'));
        const result = new Promise<CampaignMediaOutcome>((resolve, reject) => { this.queue.push({ request, resolve, reject }); });
        this.inflight.set(request.id, result);
        void result.then(() => this.inflight.delete(request.id), () => this.inflight.delete(request.id));
        this.syncFullscreen(); this.advance(); return result;
    }
    private syncFullscreen(): void {
        const active = !!this.current && campaignMoviePauses(this.current.request.placement)
            || this.pauseQueuedFullscreen && this.queue.some(item => campaignMoviePauses(item.request.placement));
        if (active !== this.fullscreenActive) { this.fullscreenActive = active; this.onFullscreen(active); }
    }
    private setAudioActive(active: boolean): void {
        if (active !== this.audioActive) { this.audioActive = active; this.onAudioActive(active); }
    }
    setPaused(paused: boolean): void {
        if (this.paused === paused) return;
        this.playbackRevision++;
        this.paused = paused;
        const current = this.current;
        if (!current) return;
        if (paused) current.video.pause();
        else this.startPlayback(current);
    }
    private startPlayback(current: NonNullable<CampaignMediaPlayer['current']>): void {
        const revision = this.playbackRevision, url = current.video.src;
        if (!url) return;
        void current.video.play().catch(error => {
            // pause(), cancellation and a newer play() can reject the old
            // asynchronous play request without indicating a decoder fault.
            if (this.current !== current || this.paused || revision !== this.playbackRevision || url !== current.video.src) return;
            current.fail(new Error(`Campaign media playback failed: ${current.request.id}: ${error.message}`));
        });
    }
    snapshot(): { id: string; placement: CampaignMediaRequest['placement']; time: number }[] {
        return [...(this.current ? [{ id: this.current.request.id, placement: this.current.request.placement, time: this.current.time() }] : []),
            ...this.queue.map(item => ({ id: item.request.id, placement: item.request.placement, time: item.request.startTime ?? 0 }))];
    }
    get pending(): string[] { return this.snapshot().map(item => item.id); }
    get playing(): boolean { return !!this.current; }
    get fullscreenPending(): boolean { return this.fullscreenActive; }
    private advance(): void {
        if (this.current || this.waiting || this.disposed) return;
        const item = this.queue[0];
        if (!item) { this.syncFullscreen(); this.setAudioActive(false); return; }
        const boundary = this.beforeStart?.(item.request);
        if (boundary) {
            this.waiting = item;
            void boundary.then(() => {
                if (this.waiting !== item || this.disposed) return;
                this.waiting = undefined;
                this.startNext(item);
            }, error => {
                if (this.waiting !== item) return;
                this.waiting = undefined;
                this.queue.shift(); item.reject(error); this.advance();
            });
        } else this.startNext(item);
    }
    private startNext(item: PendingMedia): void {
        if (this.queue[0] !== item || this.disposed) return;
        this.queue.shift();
        const { request } = item, fullscreen = request.placement === 'fullscreen';
        let host = fullscreen ? document.body : this.transmissionHost();
        if (!host) { item.reject(new Error('Campaign radar surface is unavailable')); this.advance(); return; }
        const element = document.createElement('section');
        element.dataset.campaignMedia = request.id;
        element.style.cssText = fullscreen
            ? 'position:fixed;inset:0;background:#000;z-index:10000;display:flex;align-items:center;justify-content:center;cursor:default;pointer-events:auto'
            : 'position:absolute;left:13px;right:15px;top:0;bottom:0;background:#000;z-index:2;pointer-events:auto;overflow:hidden';
        const video = document.createElement('video');
        video.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
        video.playsInline = true; video.preload = 'metadata';
        video.volume = Math.max(0, Math.min(1, this.volume()));
        element.append(video);
        const subtitle = document.createElement('div');
        subtitle.dataset.campaignMovieSubtitle = request.id;
        subtitle.style.cssText = fullscreen
            ? 'position:absolute;bottom:max(76px,8vh);left:50%;transform:translateX(-50%);width:min(84vw,calc(100vh * 1.333 - 48px));box-sizing:border-box;padding:5px 14px;color:#fffbdc;text-align:center;white-space:pre-line;font:600 clamp(20px,2.6vh,44px)/1.45 system-ui,sans-serif;text-shadow:0 2px 3px #000,1px 0 2px #000,-1px 0 2px #000;pointer-events:none'
            : "position:fixed;z-index:1001;box-sizing:border-box;padding:4px 8px;color:#fffbdc;text-align:right;white-space:pre-line;font:500 15px/1.35 'Fira Sans Condensed',Arial,sans-serif;text-shadow:0 2px 3px #000;pointer-events:none";
        (fullscreen ? element : document.body).append(subtitle);
        let subtitleFrame = 0;
        const syncSubtitle = () => {
            video.volume = Math.max(0, Math.min(1, this.volume()));
            if (!fullscreen) {
                // A viewport or UI-scale change can rebuild the sidebar.
                // Move the same decoder element onto the current radar host.
                const radar = this.transmissionHost();
                if (radar && element.parentElement !== radar) { radar.append(element); host = radar; }
                const bounds = host!.getBoundingClientRect(), scale = bounds.width / host!.offsetWidth;
                subtitle.style.top = `${bounds.top + 5 * scale}px`;
                subtitle.style.right = `${Math.max(0, innerWidth - bounds.left + 4 * scale)}px`;
                subtitle.style.maxWidth = `${Math.max(120, Math.min(420 * scale, bounds.left - 16))}px`;
                subtitle.style.fontSize = `${13 * scale}px`;
            }
            const strategy = this.current?.source?.subtitleStrategy;
            const text = strategy === 'none' || strategy === 'burned-in' ? '' : request.subtitles
                ? currentCampaignSubtitle(request.subtitles, this.current?.time() ?? request.startTime ?? 0) : request.subtitle ?? '';
            if (subtitle.textContent !== text) subtitle.textContent = text;
            subtitle.hidden = !text;
            subtitle.style.background = text ? '#000a' : 'transparent';
        };
        const updateSubtitle = () => { syncSubtitle(); subtitleFrame = requestAnimationFrame(updateSubtitle); };
        video.ontimeupdate = video.onseeking = video.onseeked = syncSubtitle;
        updateSubtitle();
        const skip = fullscreen ? document.createElement('button') : undefined;
        if (skip) {
            skip.textContent = request.skipLabel;
            skip.style.cssText = 'position:absolute;right:16px;bottom:16px;padding:10px 22px;background:#292524;color:#fff;border:1px solid #b58b59;font:18px sans-serif;cursor:pointer';
            element.append(skip);
        }
        let settled = false, fallbackUsed = false, ready = false, resumeTime = request.startTime ?? 0;
        const onKey = (event: KeyboardEvent) => { if (fullscreen && event.code === 'Escape') {
            event.preventDefault(); event.stopImmediatePropagation(); settle('skipped');
        } };
        const settle = (outcome: CampaignMediaOutcome, error?: Error) => {
            if (settled) return;
            settled = true;
            cancelAnimationFrame(subtitleFrame);
            video.ontimeupdate = video.onseeking = video.onseeked = null;
            document.removeEventListener('keydown', onKey, true);
            video.onended = video.onerror = video.onloadedmetadata = null;
            video.pause(); video.removeAttribute('src'); video.load(); element.remove(); subtitle.remove();
            this.current = undefined;
            this.syncFullscreen();
            if (!this.queue.length || this.beforeStart) this.setAudioActive(false);
            this.outcomes.push({ id: request.id, outcome });
            if (error) item.reject(error); else item.resolve(outcome);
            this.advance();
        };
        const current: NonNullable<CampaignMediaPlayer['current']> = { request, video, settle,
            time: () => ready ? movieTime(video.currentTime, current.source?.timeline, true) : resumeTime,
            fail: error => {
                if (settled) return;
                const fallback = current.source?.fallback;
                if (!fallback || fallbackUsed) { settle('cancelled', error); return; }
                // Retain the same queue item and source clock. No action or completion is reissued.
                resumeTime = current.time(); fallbackUsed = true; ready = false;
                video.onerror = video.onended = video.onloadedmetadata = null;
                this.playbackRevision++; video.pause(); video.removeAttribute('src'); video.load();
                element.dataset.movieFallback = 'original';
                void fallback().then(source => { if (!settled) loadSource(source); }, failure => {
                    if (!settled) settle('cancelled', failure instanceof Error ? failure : Error(String(failure)));
                });
            } };
        const loadSource = (source: CampaignMediaSource) => {
            if (settled) return;
            current.source = source;
            element.dataset.movieSource = source.kind;
            video.onerror = () => { if (current.source === source) current.fail(new Error(`Campaign media could not be decoded: ${request.id}`)); };
            video.onended = () => { if (current.source === source) settle('ended'); };
            video.onloadedmetadata = () => {
                if (settled) return;
                const time = movieTime(resumeTime, source.timeline);
                if (time > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(time, Math.max(0, video.duration - .05));
                ready = true; syncSubtitle();
            };
            video.src = source.url;
            if (!this.paused) this.startPlayback(current);
        };
        this.current = current;
        if (skip) skip.onclick = () => settle('skipped');
        video.onended = () => settle('ended');
        video.onerror = () => current.fail(new Error(`Campaign media could not be decoded: ${request.id}`));
        document.addEventListener('keydown', onKey, true); host.append(element);
        this.syncFullscreen();
        this.setAudioActive(true);
        if (request.source) void request.source().then(source => { if (!settled) loadSource(source); }, error => {
            if (!settled) settle('cancelled', error instanceof Error ? error : Error(String(error)));
        });
        else loadSource({ url: request.url, kind: 'original' });
    }
    cancel(): void {
        this.waiting = undefined;
        for (const item of this.queue.splice(0)) { this.outcomes.push({ id: item.request.id, outcome: 'cancelled' }); item.resolve('cancelled'); }
        this.current?.settle('cancelled');
        this.syncFullscreen();
    }
    async finishForResult(): Promise<boolean> {
        // The final source action can queue its report beside the win action.
        // Drain every placement before disposing the world and radar host.
        do {
            const retained = this.snapshot().map(item => this.inflight.get(item.id)!);
            if ((await Promise.all(retained)).some(outcome => outcome === 'cancelled')) return false;
        } while (this.current || this.queue.length);
        return !this.disposed;
    }
    dispose(): void { this.disposed = true; this.cancel(); }
}
