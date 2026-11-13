import { expect, test } from 'bun:test';
import { Music } from '../../src/engine/sound/Music';
import { validCampaignPresentation } from '../../src/game/campaign/CampaignCheckpoint';

function fixture() {
    const specs = [{ name: 'THEME:Grinder', sound: 'Grinder', normal: true, repeat: false },
        { name: 'THEME:InDeep', sound: 'InDeep', normal: true, repeat: false },
        { name: 'THEME:Burn', sound: 'Burn', normal: true, repeat: false }];
    const played: string[] = [], ended: (() => void)[] = [];
    const music = new Music({ playMusicFile: async (file, _repeat, onEnded) => {
        played.push(file); if (onEnded) ended.push(onEnded); return true;
    }, stopMusic() {} }, { get: async name => name }, {
        getSpec: name => specs.find(spec => spec.sound === name), getAll: () => specs });
    return { music, played, ended };
}

test('the original scenario theme starts at its own playlist entry and then uses ordinary playlist advancement', async () => {
    const { music, played, ended } = fixture();
    await music.playCampaignTheme('InDeep');
    expect(played).toEqual(['indeep.mp3']); expect(music.getCurrentPlaylistItem()?.sound).toBe('InDeep');
    ended[0](); await Promise.resolve(); await Promise.resolve();
    expect(played).toEqual(['indeep.mp3', 'burn.mp3']);
});

test('No theme preserves the normal music path, while an unknown required theme fails explicitly', async () => {
    const { music, played } = fixture();
    await music.playCampaignTheme('No theme'); expect(played).toEqual(['grinder.mp3']);
    expect(music.getShuffleMode()).toBe(false); expect(music.getRepeatMode()).toBe(false);
    await expect(music.playCampaignTheme('UnverifiedTheme')).rejects.toThrow('Original campaign theme is unavailable');
    expect(played).toEqual(['grinder.mp3']);
});

test('leaving a mission during an asynchronous theme fetch cannot start stale music afterward', async () => {
    let finish: (value: string) => void = () => {}, plays = 0;
    const spec = { name: 'THEME:InDeep', sound: 'InDeep', normal: true, repeat: false };
    const music = new Music({ playMusicFile: async () => { plays++; return true; }, stopMusic() {} },
        { get: () => new Promise(resolve => finish = resolve) }, { getSpec: () => spec, getAll: () => [spec] });
    const pending = music.playCampaignTheme('InDeep'); music.stopPlaying(); finish('indeep.mp3'); await pending;
    expect(plays).toBe(0);
});

test('music restore uses the saved original sound and media time without changing playlist options', async () => {
    const spec = { name: 'THEME:InDeep', sound: 'InDeep', normal: true, repeat: false };
    const offsets: number[] = [], state = { playing: true, time: 0, duration: 204, gain: .3 };
    const music = new Music({ playMusicFile: async (_file, _repeat, _ended, time = 0) => {
        offsets.push(time); state.time = time; return true;
    }, stopMusic() {}, getMusicPlaybackState: () => state }, { get: async name => name }, { getSpec: () => spec, getAll: () => [spec] });
    await music.playCampaignTheme('InDeep'); state.time = 17.25;
    const snapshot = music.capturePlayback()!; expect(snapshot).toEqual({ sound: 'InDeep', time: 17.25 });
    music.stopPlaying(); await music.restorePlayback(snapshot);
    expect(offsets).toEqual([0, 17.25]); expect(music.getPlaybackState()?.sound).toBe('InDeep');
    expect(music.getRepeatMode()).toBe(false); expect(music.getShuffleMode()).toBe(false);
    await expect(music.restorePlayback({ sound: 'Unknown', time: 1 })).rejects.toThrow('unavailable');
});

test('presentation compatibility accepts old snapshots and validates optional music independently of simulation', () => {
    const legacy = { movies: [], speech: [], speechPolicy: 'restart-current-utterance' };
    expect(validCampaignPresentation(legacy)).toBe(true);
    expect(validCampaignPresentation({ ...legacy, music: { sound: 'InDeep', time: 17.25 } })).toBe(true);
    expect(validCampaignPresentation({ ...legacy, music: { sound: '../external', time: 1 } })).toBe(false);
    expect(validCampaignPresentation({ ...legacy, music: { sound: 'InDeep', time: NaN } })).toBe(false);
});
