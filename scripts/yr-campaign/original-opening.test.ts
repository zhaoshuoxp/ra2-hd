import { expect, test } from 'bun:test';
import { CampaignScreen } from '../../src/gui/screen/mainMenu/campaign/CampaignScreen';
import { campaignMissionImplemented } from '../../src/data/campaign/CampaignMission';

function screenFor(intro = 'INTRO', brief = 'BRIEF') {
    const screen: any = Object.create(CampaignScreen.prototype);
    const requests: string[] = [], pending: ((outcome: string) => void)[] = [];
    let launches = 0, musicRestarts = 0;
    Object.assign(screen, {
        generation: 1, busy: false, strings: { get: (key: string) => key }, render() {},
        music: { play: () => { musicRestarts++; } },
        prepared: { manifest: { mission: 'sov01umd.map' }, definition: { ini: {
            getSection: () => ({ getString: (key: string) => key === 'Intro' ? intro : brief }),
        } } },
        preview: (name: string) => {
            requests.push(name);
            return new Promise<string>(resolve => pending.push(resolve));
        },
        launchMission: () => { launches++; },
    });
    return { screen, requests, pending, launches: () => launches, musicRestarts: () => musicRestarts };
}

test('an unlisted YR mission retains its public start guard', async () => {
    expect(campaignMissionImplemented('yr', 'sov08tmd.map')).toBe(false);
    const fixture = screenFor();
    fixture.screen.prepared.manifest.mission = 'sov08tmd.map';
    await fixture.screen.startSelected();
    expect(fixture.requests).toEqual([]); expect(fixture.launches()).toBe(0);
    expect(fixture.screen.busy).toBe(false);
});

test('the fourteen source-qualified YR missions open only within their edition', () => {
    for (const mission of ['sov01umd.map', 'sov02smd.map', 'sov03umd.map', 'sov04dmd.map',
        'sov05umd.map', 'sov06lmd.map', 'sov07tmd.map', 'all01umd.map', 'all02umd.map', 'all03umd.map',
        'all04dmd.map', 'all05umd.map', 'all06umd.map', 'all07smd.map']) {
        expect(campaignMissionImplemented('yr', mission)).toBe(true);
        expect(campaignMissionImplemented('ra2', mission)).toBe(false);
    }
    expect(campaignMissionImplemented('yr', 'sov01t.map')).toBe(false);
    expect(campaignMissionImplemented('yr', 'trn01tmd.map')).toBe(false);
});

test('the shared original opening awaits Intro and Brief before creating the source world', async () => {
    const fixture = screenFor(), opening = fixture.screen.startPrepared();
    expect(fixture.requests).toEqual(['intro']); expect(fixture.launches()).toBe(0);
    fixture.pending.shift()!('ended'); await Promise.resolve();
    expect(fixture.requests).toEqual(['intro', 'brief']); expect(fixture.launches()).toBe(0);
    fixture.pending.shift()!('skipped'); await opening;
    expect(fixture.launches()).toBe(1); expect(fixture.musicRestarts()).toBe(0);
});

test('duplicate original opening names play once', async () => {
    const fixture = screenFor('BRIEF', 'brief'), opening = fixture.screen.startPrepared();
    fixture.pending.shift()!('ended'); await opening;
    expect(fixture.requests).toEqual(['brief']); expect(fixture.launches()).toBe(1);
});

test('cancellation and route changes cannot launch a world after an opening', async () => {
    const cancelled = screenFor(), first = cancelled.screen.startPrepared();
    cancelled.pending.shift()!('cancelled'); await first;
    expect(cancelled.launches()).toBe(0); expect(cancelled.screen.busy).toBe(false);
    expect(cancelled.screen.error).toContain('cancelled'); expect(cancelled.musicRestarts()).toBe(1);
    const changed = screenFor(), second = changed.screen.startPrepared();
    changed.screen.generation++; changed.pending.shift()!('ended'); await second;
    expect(changed.requests).toEqual(['intro']); expect(changed.launches()).toBe(0);
});
