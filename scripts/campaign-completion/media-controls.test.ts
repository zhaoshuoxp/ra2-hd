import { expect, test } from 'bun:test';
import { GameScreen } from '../../src/gui/screen/game/GameScreen';

test('restored fullscreen and menu pause retain both the simulation and control gates until all blockers end', () => {
    const states: unknown[] = [];
    const context: any = { game: { campaign: { launch: { semanticsVersion: 14 }, inputLocked: false } },
        campaignMediaPlayer: { fullscreenPending: true, pending: ['ending'], setPaused() {} },
        campaignSpeech: { setPaused() {} },
        gameTurnMgr: { setCampaignPaused: (paused: boolean) => states.push(['turn', paused]) },
        playerUi: { worldInteraction: { setEnabled: (enabled: boolean) => states.push(['input', enabled]) } },
        syncCampaignMediaControls: (GameScreen.prototype as any).syncCampaignMediaControls };
    const pause = (value: boolean) => (GameScreen.prototype as any).setCampaignMediaPaused.call(context, value);
    pause(false); expect(states.splice(0)).toEqual([['turn', true], ['input', false]]);
    pause(true); context.campaignMediaPlayer.fullscreenPending = false; context.syncCampaignMediaControls();
    expect(states.splice(0)).toEqual([['turn', true], ['input', false], ['turn', true], ['input', false]]);
    pause(false); expect(states.splice(0)).toEqual([['turn', false], ['input', true]]);
    context.game.campaign.inputLocked = true; context.syncCampaignMediaControls();
    expect(states.splice(0)).toEqual([['turn', false], ['input', false]]);
    context.gameEndHandled = true; context.syncCampaignMediaControls();
    expect(states.splice(0)).toEqual([['turn', true], ['input', false]]);
    context.game.campaign.launch.semanticsVersion = 13; pause(false); expect(states).toEqual([]);
});

test('resuming a new YR menu releases narration while a queued movie waits for that narration', () => {
    const speech: boolean[] = [], turns: boolean[] = [];
    const context: any = { game: { campaign: { launch: { semanticsVersion: 46 }, inputLocked: false } },
        campaignMediaPlayer: { fullscreenPending: true, pending: ['after-narration'], playing: false, setPaused() {} },
        campaignSpeech: { setPaused: (value: boolean) => speech.push(value) },
        gameTurnMgr: { setCampaignPaused: (value: boolean) => turns.push(value) },
        syncCampaignMediaControls: (GameScreen.prototype as any).syncCampaignMediaControls };
    const pause = (value: boolean) => (GameScreen.prototype as any).setCampaignMediaPaused.call(context, value);
    pause(true); pause(false);
    expect(speech).toEqual([true, false]); expect(turns).toEqual([true, true]);
    context.campaignMediaPlayer.playing = true; pause(false); expect(speech.at(-1)).toBe(true);
    context.game.campaign.launch.semanticsVersion = 45;
    context.campaignMediaPlayer.playing = false; pause(false); expect(speech.at(-1)).toBe(true);
});
