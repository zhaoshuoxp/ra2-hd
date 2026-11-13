import { expect, test } from 'bun:test';
import { InternalPlaybackHandle } from '../../src/engine/sound/InternalPlaybackHandle';
import { CampaignSpeechQueue } from '../../src/gui/campaign/CampaignSpeechQueue';

test('audio completion settles exactly once on natural end, stop and decode failure', async () => {
    for (const reason of ['ended', 'stopped', 'error'] as const) {
        const handle = new InternalPlaybackHandle();
        if (reason === 'stopped') handle.stop(); else handle.finish(reason);
        handle.finish('error'); expect(await handle.completed).toBe(reason); expect(handle.isPlaying()).toBe(false);
    }
});

test('repeated mission voices queue without loss and cancellation restores the music gain', async () => {
    const handles: InternalPlaybackHandle[] = [], pending: string[][] = [], volumes: number[] = [], errors: string[] = [];
    let volume = .8;
    const queue = new CampaignSpeechQueue({ getSpec: () => ({ sound: 'voice', text: 'source subtitle' }) },
        { getWavFile: () => ({}), audioSystem: { playWavFile: () => { const h = new InternalPlaybackHandle(); handles.push(h); return h; } } },
        { getVolume: () => volume, setVolume: (_channel: number, value: number) => { volume = value; volumes.push(value); } },
        { has: () => false }, () => {}, ids => pending.push(ids), error => errors.push(error));
    queue.playMission('first'); queue.playMission('first'); queue.playMission('second');
    expect(handles.length).toBe(1); expect(pending.at(-1)).toEqual(['first', 'first', 'second']);
    handles[0].finish('ended'); await Promise.resolve(); expect(handles.length).toBe(2);
    handles[1].finish('error'); await Promise.resolve(); expect(handles.length).toBe(3); expect(errors.length).toBe(1);
    queue.dispose(); await Promise.resolve(); expect(volume).toBe(.8); expect(pending.at(-1)).toEqual([]);
    expect(queue.outcomes.map(outcome => outcome.reason)).toEqual(['ended', 'error', 'stopped']);
    expect(volumes[0]).toBeCloseTo(.24);
});

test('mission speech precedes queued routine EVA and completion waits for the actual final voice', async () => {
    const handles: InternalPlaybackHandle[] = [], played: string[] = [];
    const queue = new CampaignSpeechQueue({ getSpec: (id: string) => ({ sound: id }) },
        { getWavFile: (id: string) => id, audioSystem: { playWavFile: (id: string) => {
            played.push(id); const handle = new InternalPlaybackHandle(); handles.push(handle); return handle;
        } } }, { getVolume: () => 1, setVolume() {} }, { has: () => false }, () => {}, () => {}, () => {});
    queue.play('unit-lost'); queue.play('promoted'); queue.playMission('victory-speech'); queue.play('victory-EVA', true);
    let complete = false; const settled = queue.whenMissionComplete().then(() => complete = true);
    handles[0].finish('ended'); await Promise.resolve(); expect(played).toEqual(['unit-lost', 'victory-speech']); expect(complete).toBe(false);
    handles[1].finish('ended'); await Promise.resolve(); expect(played.at(-1)).toBe('victory-EVA'); expect(complete).toBe(false);
    handles[2].finish('ended'); await settled; expect(complete).toBe(true); expect(played.at(-1)).toBe('promoted');
    queue.dispose();
});
