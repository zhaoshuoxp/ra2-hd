import { expect, test } from 'bun:test';
import { CampaignMediaPlayer, type CampaignMediaRequest } from '../../src/gui/campaign/CampaignMediaPlayer';
import { CampaignSpeechQueue } from '../../src/gui/campaign/CampaignSpeechQueue';

async function withMediaDom(run: (nodes: any[], body: any) => Promise<void>): Promise<void> {
    const keys = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth'];
    const saved = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    const nodes: any[] = [];
    const node = (tag: string): any => {
        const value: any = { tag, dataset: {}, style: {}, children: [], currentTime: 0, duration: 20, offsetWidth: 200,
            play: () => Promise.resolve(), pause() {}, load() {},
            removeAttribute(key: string) { delete this[key]; },
            getBoundingClientRect: () => ({ left: 900, top: 0, width: 200 }),
            append(child: any) { child.remove(); child.parentElement = this; this.children.push(child); },
            remove() {
                if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child: any) => child !== this);
                this.parentElement = undefined;
            } };
        nodes.push(value); return value;
    };
    const body = node('body');
    Object.assign(globalThis, { document: { body, createElement: node, querySelector: () => undefined,
        addEventListener() {}, removeEventListener() {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, innerWidth: 1200 });
    try { await run(nodes, body); }
    finally { keys.forEach((key, index) => saved[index] ? Object.defineProperty(globalThis, key, saved[index]!) : delete (globalThis as any)[key]); }
}
const request = (id: string, placement: CampaignMediaRequest['placement'], startTime = 0): CampaignMediaRequest =>
    ({ id, placement, url: `blob:${id}`, skipLabel: 'Skip', startTime });
const activeVideo = (nodes: any[]) => nodes.find(node => node.tag === 'video' && node.src);

test('an HD decoder fault resumes the same radar item on the source clock and settles once', async () => {
    await withMediaDom(async (nodes, host) => {
        const pauses: boolean[] = [], audio: boolean[] = [];
        const player = new CampaignMediaPlayer(value => pauses.push(value), () => 1, value => audio.push(value), () => host, true);
        const movie = player.play({ ...request('mapped-radar', 'transmission-paused', 3), source: async () => ({
            url: '/hd.webm', kind: 'hd', timeline: [{ original: 0, media: 0 }, { original: 20, media: 25 }],
            fallback: async () => ({ url: '/original.webm', kind: 'original' }),
        }) });
        expect(pauses).toEqual([true]); expect(player.snapshot()[0].time).toBe(3);
        await Promise.resolve();
        const video = activeVideo(nodes); video.duration = 25; video.onloadedmetadata();
        expect(video.currentTime).toBe(3.75);
        video.currentTime = 7.5; expect(player.snapshot()[0].time).toBe(6);
        video.onerror(); await Promise.resolve(); video.duration = 20; video.onloadedmetadata();
        expect(video.src).toBe('/original.webm'); expect(video.currentTime).toBe(6);
        expect(player.pending).toEqual(['mapped-radar']); expect(player.outcomes).toEqual([]);
        expect(pauses).toEqual([true]); expect(audio).toEqual([true]);
        video.onended(); expect(await movie).toBe('ended');
        expect(player.outcomes).toEqual([{ id: 'mapped-radar', outcome: 'ended' }]);
        expect(pauses).toEqual([true, false]); expect(audio).toEqual([true, false]);
        expect(host.children).toEqual([]); player.dispose();
    });
});

test('HD failure tries the original once, preserves queued order and cannot revive a cancelled source', async () => {
    await withMediaDom(async (nodes, host) => {
        let finish!: (value: any) => void;
        const player = new CampaignMediaPlayer(() => {}, () => 1, () => {}, () => host);
        const pending = player.play({ ...request('loading', 'fullscreen'), source: () => new Promise(resolve => finish = resolve) });
        player.cancel(); finish({ url: '/late.webm', kind: 'hd' }); await Promise.resolve();
        expect(await pending).toBe('cancelled'); expect(activeVideo(nodes)).toBeUndefined();
        const failed = player.play({ ...request('failed', 'transmission'), source: async () => ({
            url: '/broken-hd.webm', kind: 'hd', fallback: async () => ({ url: '/broken-original.webm', kind: 'original' }),
        }) }).catch(error => error.message);
        const next = player.play(request('next', 'fullscreen'));
        await Promise.resolve(); const video = activeVideo(nodes); video.onloadedmetadata();
        video.onerror(); await Promise.resolve(); video.onerror();
        expect(await failed).toContain('could not be decoded');
        expect(player.pending).toEqual(['next']); activeVideo(nodes).onended(); expect(await next).toBe('ended');
        expect(player.outcomes.map(item => [item.id, item.outcome])).toEqual([
            ['loading', 'cancelled'], ['failed', 'cancelled'], ['next', 'ended'],
        ]); player.dispose(); expect(host.children).toEqual([]);
    });
});

test('a queued movie preserves the active narration boundary and can be cancelled while waiting', async () => {
    await withMediaDom(async (nodes, host) => {
        let finishSpeech!: () => void;
        let boundary: Promise<void> | undefined = new Promise(resolve => finishSpeech = resolve);
        const pauses: boolean[] = [];
        const player = new CampaignMediaPlayer(value => pauses.push(value), () => 1, () => {}, () => host, true,
            () => boundary);
        const movie = player.play(request('after-narration', 'fullscreen'));
        expect(activeVideo(nodes)).toBeUndefined(); expect(player.playing).toBe(false); expect(pauses).toEqual([true]);
        expect(player.snapshot()).toEqual([{ id: 'after-narration', placement: 'fullscreen', time: 0 }]);
        boundary = undefined; finishSpeech(); await Promise.resolve();
        expect(activeVideo(nodes)).toBeDefined(); expect(player.playing).toBe(true); activeVideo(nodes).onended();
        expect(await movie).toBe('ended'); expect(player.playing).toBe(false); expect(pauses).toEqual([true, false]);
        boundary = new Promise(resolve => finishSpeech = resolve);
        const waiting = player.play(request('cancel-before-narration-end', 'fullscreen'));
        player.cancel(); expect(await waiting).toBe('cancelled');
        finishSpeech(); await Promise.resolve(); expect(activeVideo(nodes)).toBeUndefined();
        expect(player.pending).toEqual([]); expect(host.children).toEqual([]); player.dispose();
    });
});

test('a movie narration boundary survives menu pause and excludes later source speech', async () => {
    const handles: { completed: Promise<string>; finish(reason: string): void; stop(): void }[] = [];
    const speech = new CampaignSpeechQueue({ getSpec: (id: string) => ({ sound: id }) }, {
        getWavFile: () => ({}), audioSystem: { setDucking() {}, playWavFile: () => {
            let finish!: (reason: string) => void;
            const handle = { completed: new Promise<string>(resolve => finish = resolve),
                finish: (reason: string) => finish(reason), stop: () => finish('stopped') };
            handles.push(handle); return handle;
        } } }, {}, { has: () => false }, () => {}, () => {}, message => { throw Error(message); });
    speech.playMission('opening'); speech.playMission('opening-second');
    let reached = false;
    const boundary = speech.whenMissionBoundaryComplete().then(() => { reached = true; });
    speech.playMission('later-source-event');
    speech.setPaused(true); await Promise.resolve();
    expect(reached).toBe(false); expect(handles).toHaveLength(1);
    expect(speech.snapshot()).toEqual([{ id: 'opening', mission: true },
        { id: 'opening-second', mission: true }, { id: 'later-source-event', mission: true }]);
    speech.setPaused(false); handles[1].finish('ended'); await Promise.resolve();
    expect(reached).toBe(false); handles[2].finish('ended'); await boundary;
    expect(reached).toBe(true); expect(speech.snapshot()).toEqual([{ id: 'later-source-event', mission: true }]);
    const cancelled = speech.whenMissionBoundaryComplete(); speech.dispose(); await cancelled;
    expect(speech.snapshot()).toEqual([]);
});

test('result narration drains the active utterance and all source lines without stopping them', async () => {
    const handles: { finish(reason: string): void; stopped: boolean }[] = [];
    const speech = new CampaignSpeechQueue({ getSpec: (id: string) => ({ sound: id }) }, {
        getWavFile: () => ({}), audioSystem: { setDucking() {}, playWavFile: () => {
            let finish!: (reason: string) => void;
            const completed = new Promise<string>(resolve => finish = resolve);
            const handle = { completed, finish, stopped: false, stop() { this.stopped = true; finish('stopped'); } };
            handles.push(handle); return handle;
        } } }, {}, { has: () => false }, () => {}, () => {}, message => { throw Error(message); });
    speech.play('active-battlefield-notice'); speech.play('queued-routine-notice'); speech.playMission('source-victory-line');
    let complete = false;
    const drain = speech.finishForResult().then(() => { complete = true; });
    expect(speech.snapshot()).toEqual([{ id: 'active-battlefield-notice', mission: false },
        { id: 'source-victory-line', mission: true }]);
    expect(handles[0].stopped).toBe(false); expect(complete).toBe(false);
    handles[0].finish('ended'); await Promise.resolve();
    expect(handles).toHaveLength(2); expect(complete).toBe(false);
    handles[1].finish('ended'); await drain;
    expect(speech.outcomes.map(item => item.reason)).toEqual(['ended', 'ended']);
    expect(complete).toBe(true); expect(speech.isIdle()).toBe(true); speech.dispose();
});

test('queued source fullscreen pauses synchronously, deduplicates and preserves saved order while legacy radar continues', async () => {
    await withMediaDom(async (nodes, host) => {
        for (const expanded of [false, true]) {
            const pauses: boolean[] = [];
            const player = new CampaignMediaPlayer(value => pauses.push(value), () => 1, () => {}, () => host, expanded);
            const radar = player.play(request('radar', 'transmission', 3));
            activeVideo(nodes).onloadedmetadata();
            const fullscreen = player.play(request('ending', 'fullscreen', 5));
            expect(player.play(request('ending', 'fullscreen'))).toBe(fullscreen);
            expect(pauses).toEqual(expanded ? [true] : []);
            expect(player.snapshot()).toEqual([{ id: 'radar', placement: 'transmission', time: 3 },
                { id: 'ending', placement: 'fullscreen', time: 5 }]);
            activeVideo(nodes).onended(); expect(await radar).toBe('ended'); expect(pauses.at(-1)).toBe(true);
            activeVideo(nodes).onloadedmetadata(); expect(player.snapshot()[0].time).toBe(5);
            activeVideo(nodes).parentElement.children.find((node: any) => node.tag === 'button').onclick();
            expect(await fullscreen).toBe('skipped'); expect(pauses.at(-1)).toBe(false);
            expect(player.pending).toEqual([]); player.dispose();
        }
    });
});

test('result drains radar and fullscreen clips in source order before releasing the world', async () => {
    await withMediaDom(async (nodes, host) => {
        const pauses: boolean[] = [], audio: boolean[] = [];
        const player = new CampaignMediaPlayer(value => pauses.push(value), () => 1, value => audio.push(value), () => host, true);
        const radar = player.play(request('radar', 'transmission'));
        const first = player.play(request('first', 'fullscreen'));
        const pendingRadar = player.play(request('pending-radar', 'transmission'));
        const last = player.play(request('last', 'fullscreen'));
        let finished = false;
        const drain = player.finishForResult().then(value => { finished = true; return value; });
        expect(player.pending).toEqual(['radar', 'first', 'pending-radar', 'last']); expect(finished).toBe(false);
        expect(activeVideo(nodes).parentElement.children.some((node: any) => node.tag === 'button')).toBe(false);
        activeVideo(nodes).onended(); expect(await radar).toBe('ended'); expect(pauses).toEqual([true]);
        activeVideo(nodes).onended(); expect(await first).toBe('ended'); expect(finished).toBe(false);
        expect(player.pending).toEqual(['pending-radar', 'last']);
        activeVideo(nodes).onended(); expect(await pendingRadar).toBe('ended'); expect(finished).toBe(false);
        expect(player.pending).toEqual(['last']); expect(pauses).toEqual([true]);
        activeVideo(nodes).onended(); expect(await last).toBe('ended'); expect(await drain).toBe(true);
        expect(pauses).toEqual([true, false]); expect(audio.at(-1)).toBe(false); expect(host.children).toEqual([]);
        player.dispose();
    });
});

test('exit cancellation and decoder failure settle retained callers, release pause and detach all media', async () => {
    await withMediaDom(async (nodes, host) => {
        const pauses: boolean[] = [];
        const player = new CampaignMediaPlayer(value => pauses.push(value), () => 1, () => {}, () => host, true);
        const ending = player.play(request('ending', 'fullscreen'));
        const drain = player.finishForResult(); player.dispose();
        expect(await ending).toBe('cancelled'); expect(await drain).toBe(false);
        expect(pauses).toEqual([true, false]); expect(player.pending).toEqual([]); expect(host.children).toEqual([]);
        const failed = new CampaignMediaPlayer(value => pauses.push(value), () => 1, () => {}, () => host, true);
        const broken = failed.play(request('broken', 'fullscreen'));
        const failedDrain = failed.finishForResult(); activeVideo(nodes).onerror();
        await expect(broken).rejects.toThrow('could not be decoded'); await expect(failedDrain).rejects.toThrow('could not be decoded');
        expect(pauses.at(-1)).toBe(false); expect(failed.pending).toEqual([]); expect(host.children).toEqual([]); failed.dispose();
    });
});

test('source paused radar retains its radar placement, saved time and pause through result draining and cancellation', async () => {
    await withMediaDom(async (nodes, host) => {
        const pauses: boolean[] = [];
        const player = new CampaignMediaPlayer(value => pauses.push(value), () => .28, () => {}, () => host, true);
        const ordinary = player.play(request('ordinary', 'transmission'));
        const paused = player.play(request('paused', 'transmission-paused', 4.2));
        expect(player.play(request('paused', 'transmission-paused'))).toBe(paused);
        expect(pauses).toEqual([true]);
        expect(player.snapshot()[1]).toEqual({ id: 'paused', placement: 'transmission-paused', time: 4.2 });
        const drain = player.finishForResult();
        activeVideo(nodes).onended(); expect(await ordinary).toBe('ended');
        const video = activeVideo(nodes); video.onloadedmetadata();
        expect(video.parentElement.parentElement).toBe(host); expect(video.volume).toBe(.28);
        expect(player.snapshot()[0].time).toBe(4.2); expect(player.fullscreenPending).toBe(true);
        expect(video.parentElement.children.some((node: any) => node.tag === 'button')).toBe(false);
        video.onended(); expect(await paused).toBe('ended'); expect(await drain).toBe(true);
        expect(pauses).toEqual([true, false]); expect(host.children).toEqual([]);
        const cancelled = player.play(request('cancelled', 'transmission-paused'));
        player.dispose(); expect(await cancelled).toBe('cancelled'); expect(pauses.at(-1)).toBe(false);
        expect(host.children).toEqual([]);
    });
});

test('a report queued by the remaining source win actions is drained after an initially empty result snapshot', async () => {
    await withMediaDom(async (nodes, host) => {
        const player = new CampaignMediaPlayer(() => {}, () => 1, () => {}, () => host, true);
        let finished = false;
        const drain = player.finishForResult().then(value => { finished = true; return value; });
        const report = player.play(request('source-win-report', 'transmission'));
        await Promise.resolve(); expect(finished).toBe(false);
        activeVideo(nodes).onended(); expect(await report).toBe('ended'); expect(await drain).toBe(true);
        expect(player.pending).toEqual([]); expect(host.children).toEqual([]); player.dispose();
    });
});
