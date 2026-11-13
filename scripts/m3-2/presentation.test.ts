import { expect, test } from 'bun:test';
import { CampaignJournal } from '../../src/game/campaign/CampaignCheckpoint';
import { Prng } from '../../src/game/Prng';
import { matchingCampaignMovieAudit, loadCampaignMovieBytes } from '../../src/gui/campaign/CampaignMovieOverride';
import { completeCampaignProgress } from '../../src/gui/campaign/CampaignProgress';
import { CampaignSpeechQueue } from '../../src/gui/campaign/CampaignSpeechQueue';
import { InternalPlaybackHandle } from '../../src/engine/sound/InternalPlaybackHandle';
import { campaignMissionImplemented } from '../../src/data/campaign/CampaignMission';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { describeCampaignMission } from '../../src/data/campaign/CampaignMission';

test('a pending radar movie and voice survive checkpoint persistence without entering simulation or RNG state', async () => {
    const make = () => {
        const game: any = { id: 'fixture', startTimestamp: 123, currentTick: 0, status: 1, afterTickCallbacks: [], prng: new Prng(42),
            gameOpts: { campaign: { edition: 'ra2', mission: 'sov02t.map', sourceSha256: 'a'.repeat(64), provenanceDigest: 'b'.repeat(64) } },
            campaign: { restoring: false, pendingMedia: ['s02_p01e'], checkpointState: () => ({ tick: game.currentTick }) },
            getHash: () => game.currentTick, getAllPlayers: () => [], update: () => { game.prng.generateRandom(); game.currentTick++; } };
        return game;
    };
    const game = make(), journal = new CampaignJournal();
    game.campaign.captureMedia = () => ({ movies: [{ id: 's02_p01e', placement: 'transmission', time: 4.2 }],
        speech: [{ id: 'EVA_ReinforcementsHaveArrived', mission: true }], speechPolicy: 'restart-current-utterance' });
    for (let i = 0; i < 19; i++) game.update();
    const checkpoint = JSON.parse(JSON.stringify(await journal.capture(game)));
    expect(checkpoint.mediaPolicy).toBe('resume-presentation-v1'); expect(checkpoint.presentation.movies[0].time).toBe(4.2);
    const restored = make(); await new CampaignJournal().restore(restored, {}, checkpoint);
    expect(restored.currentTick).toBe(19); expect(restored.prng.snapshot()).toEqual(game.prng.snapshot());
    const corrupt = structuredClone(checkpoint); corrupt.presentation.movies[0].time = 4.3;
    await expect(new CampaignJournal().restore(make(), {}, corrupt)).rejects.toThrow('incompatible');
});

test('an HD movie must match the original cut, audio, language, aspect, duration and subtitle timeline', async () => {
    const movie = { name: 's02_p01e', original: 's02_p01e.bik', file: 's02_p01e.webm', sha256: 'a'.repeat(64), durationSeconds: 9.33, width: 640, height: 480 };
    const entry = { name: 'hd.webm', route: '/local-campaign/ra2/sov02t/hd.webm', sha256: 'b'.repeat(64), bytes: 4 };
    const original = { name: movie.original, sha256: movie.sha256, durationSeconds: movie.durationSeconds, language: 'en',
        audioPcmSha256: 'c'.repeat(64), subtitleTimelineSha256: 'd'.repeat(64) };
    const audit = { schema: 'campaign-movie-match-v1', cut: 'frame-matched', matchedFrames: 140,
        original, replacement: { ...original, sha256: entry.sha256, width: 1920, height: 1440 } };
    expect(matchingCampaignMovieAudit(audit, movie, entry)).toBe(true);
    for (const change of [{ language: 'zh-CN' }, { audioPcmSha256: 'e'.repeat(64) }, { subtitleTimelineSha256: 'f'.repeat(64) },
        { durationSeconds: 9.5 }, { width: 1920, height: 1080 }, { sha256: '0'.repeat(64) }]) {
        expect(matchingCampaignMovieAudit({ ...audit, replacement: { ...audit.replacement, ...change } }, movie, entry)).toBe(false);
    }
    const fallback = new Uint8Array([1, 2, 3]), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', fallback))].map(v => v.toString(16).padStart(2, '0')).join('');
    const fetchBefore = globalThis.fetch, warnBefore = console.warn;
    const paths: string[] = [];
    try {
        console.warn = () => {};
        globalThis.fetch = (async (route: string) => { paths.push(route); return new Response(fallback); }) as any;
        const manifest: any = { files: [{ name: movie.file, bytes: 3, sha256: hash, route: '/local-campaign/ra2/sov02t/' + movie.file }] };
        expect(await loadCampaignMovieBytes(manifest, { ...movie, hdCandidate: { file: 'missing.webm', verification: 'missing.json' } })).toEqual(fallback);
        expect(paths).toEqual(['/local-campaign/ra2/sov02t/' + movie.file]);
    } finally { globalThis.fetch = fetchBefore; console.warn = warnBefore; }
});

test('speech pause persists the current utterance and queue, then releases temporary music ducking', async () => {
    const handles: InternalPlaybackHandle[] = [], ducking: (number | undefined)[] = [];
    const make = () => new CampaignSpeechQueue({ getSpec: (id: string) => ({ sound: id }) },
        { getWavFile: (id: string) => id, audioSystem: { setDucking: (_owner: unknown, _channel: number, gain?: number) => ducking.push(gain),
            playWavFile: () => { const handle = new InternalPlaybackHandle(); handles.push(handle); return handle; } } },
        {}, { has: () => false }, () => {}, () => {}, message => { throw Error(message); });
    const queue = make(); queue.playMission('first'); queue.playMission('second'); queue.setPaused(true);
    const snapshot = JSON.parse(JSON.stringify(queue.snapshot())); queue.dispose(); await Promise.resolve();
    const restored = make(); restored.setPaused(true); restored.restore(snapshot);
    expect(handles.length).toBe(1); restored.setPaused(false); expect(handles.length).toBe(2);
    expect(restored.snapshot().map(row => row.id)).toEqual(['first', 'second']);
    handles[1].finish('ended'); await Promise.resolve(); expect(handles.length).toBe(3);
    handles[2].finish('ended'); await restored.whenMissionComplete(); expect(ducking.at(-1)).toBeUndefined(); restored.dispose();
});

test('direct replay completion preserves old difficulty records and cannot make later archived missions playable', () => {
    const old = { version: 1, edition: 'ra2', completed: ['easy', 'hard'].map(difficulty => ({ mission: 'sov01t.map', difficulty,
        sourceSha256: 'a', provenanceDigest: 'b', completedAt: 'old' })) };
    const progress = completeCampaignProgress(JSON.stringify(old), { edition: 'ra2', faction: 'soviet', mission: 'sov02t.map',
        difficulty: 'normal', sourceSha256: 'c', provenanceDigest: 'd' }, 'new');
    expect(progress.completed).toHaveLength(3); expect(progress.completed.filter(row => row.mission === 'sov01t.map')).toHaveLength(2);
    expect(campaignMissionImplemented('ra2', 'sov02t.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov03u.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov04s.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov05u.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov06t.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov07s.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov08u.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov09u.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov10t.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov11s.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'sov12s.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all01t.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all02s.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all03u.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all04u.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all05s.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all12s.map')).toBe(true);
    for (const mission of ['trn01t.map', 'trn02t.map']) expect(campaignMissionImplemented('ra2', mission)).toBe(true);
    expect(campaignMissionImplemented('yr', 'sov01umd.map')).toBe(true);
    expect(campaignMissionImplemented('yr', 'sov08tmd.map')).toBe(false);
});

test('legacy journals preserve condition latches while new missions reevaluate the current world', () => {
    const definition = new CampaignDefinition('ra2', 'fixture.map', '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\n'
        + '[Triggers]\nT=P,<none>,T,0,1,1,1,0\n[Tags]\nG=0,T,T\n[Events]\nT=2,11,0,0,13,0,20\n[Actions]\nT=1,2,0,0,0,0,0,0,A\n');
    let empty = true;
    const host = { targets: () => [], condition: () => empty, action: () => {} };
    const legacy = new CampaignTriggerMachine(definition, 'normal', host, 15, true);
    const current = new CampaignTriggerMachine(definition, 'normal', host);
    legacy.update(); current.update(); empty = false;
    for (let i = 0; i < 301; i++) { legacy.update(); current.update(); }
    expect(legacy.states.get('T')!.fired).toBe(1);
    expect(current.states.get('T')!.fired).toBe(0);
});

test('qualified Desert and Lunar YR catalog entries retain order and titles', () => {
    const entries = readCampaignCatalog('yr', '[SOV01]\nScenario=sov01umd.map\n[SOV04]\nScenario=sov04dmd.map\n[SOV06]\nScenario=sov06lmd.map\n');
    expect(entries.map(entry => entry.next)).toEqual(['sov04dmd.map', 'sov06lmd.map', undefined]);
    expect(entries.map(describeCampaignMission).map(entry => [entry.title, entry.playable]))
        .toEqual([['Name:Sov01md', true], ['Name:Sov04md', true], ['Name:Sov06md', true]]);
    expect(() => readCampaignCatalog('yr', '[BAD]\nScenario=sov04qmd.map\n')).toThrow('Unsupported');
});
