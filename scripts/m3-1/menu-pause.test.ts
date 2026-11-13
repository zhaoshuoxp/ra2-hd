import { expect, test } from 'bun:test';
import { GameScreen } from '../../src/gui/screen/game/GameScreen';

test('opening a restored campaign menu preserves its checkpoint tick while skirmish drains pending commands', () => {
    for (const campaign of [true, false]) {
        const callbacks: Record<string, () => void> = {};
        const menu = Object.fromEntries(['onOpen', 'onQuit', 'onObserve', 'onCancel']
            .map(name => [name, { subscribe: (callback: () => void) => { callbacks[name] = callback; } }]));
        const game = { currentTick: 4062, campaign: campaign ? {} : undefined,
            speed: { value: 2 }, desiredSpeed: { value: 2 } };
        const pauses: [string, boolean][] = [];
        const context: any = { setCampaignMediaPaused() {}, isSinglePlayer: true, pointer: { unlock() {} },
            playerUi: { worldInteraction: { setEnabled() {} } }, mixer: { setMuted() {} },
            gameTurnMgr: { doGameTurn: () => { game.currentTick++; },
                setPaused: (value: boolean) => pauses.push(['skirmish', value]),
                setCampaignPaused: (value: boolean) => pauses.push(['campaign', value]) } };
        (GameScreen.prototype as any).initGameMenuEvents.call(context, menu, {}, game, {}, {}, {});
        callbacks.onOpen();
        expect(game.currentTick).toBe(campaign ? 4062 : 4063);
        expect(context.pausedAtSpeed).toBe(2);
        expect(pauses).toEqual([[campaign ? 'campaign' : 'skirmish', true]]);
        expect(game.speed.value).toBe(campaign ? 2 : Number.EPSILON);
        callbacks.onOpen();
        expect(game.currentTick).toBe(campaign ? 4062 : 4063);
        expect(pauses).toHaveLength(1);
    }
});
