import { expect, test } from 'bun:test';
import { Game, GameStatus } from '../../src/game/Game';
import { PhysicalPlayTime } from '../../src/game/PhysicalPlayTime';
import { CampaignPlayTime } from '../../src/game/campaign/CampaignPlayTime';
import { SoloPlayTurnManager } from '../../src/network/gamestate/SoloPlayTurnManager';
import { SkirmishSaveJournal, legacySkirmishPlayTime, restoreSkirmish, validateSave } from '../../src/gui/save/SkirmishSave';
import { BoxedVar } from '../../src/util/BoxedVar';

function simulation(saved?: any) {
    let now = 1000;
    const player = { name: 'Player', defeated: false };
    const game: any = { status: GameStatus.NotStarted, currentTick: 0, currentTime: 0, localPlayer: player,
        speed: new BoxedVar(1), desiredSpeed: new BoxedVar(1), playTime: new PhysicalPlayTime(() => now),
        _onEnd: { dispatch() {} }, end: Game.prototype.end,
        start() { this.status = GameStatus.Started; },
        update() { this.currentTick++; this.currentTime += 1000 / 15; },
        getHash() { return this.currentTick * 47; } };
    const journal = new SkirmishSaveJournal({ edition: 'ra2', engineVersion: 'test', modHash: '',
        gameId: 'clock', gameTimestamp: 1700000000000,
        gameOpts: { mapName: 'test.map', humanPlayers: [{ name: player.name }] },
        playerName: player.name, mapData: 'dGVzdA==', initialSpeed: 1 }, saved);
    const manager = new SoloPlayTurnManager(game, player, { dequeueAll: () => [] }, undefined, undefined, journal);
    manager.init();
    return { game, journal, manager, player, advance(ms: number) { now += ms; } };
}

test('solo skirmish clock counts physical play across speed changes and stops at pause, error and synchronous score dispatch', () => {
    const s = simulation(); s.advance(90000); s.manager.doGameTurn(0);
    expect(s.game.playTime.elapsedMs).toBe(0);
    s.game.start(); s.manager.doGameTurn(0); s.advance(1200);
    s.game.desiredSpeed.value = 4; s.manager.doGameTurn(0); s.advance(1800);
    s.manager.setPaused(true); s.advance(300000);
    expect(s.game.playTime.elapsedMs).toBe(3000);
    s.manager.setPaused(false); s.advance(500);
    let scoreDuration = -1;
    s.game._onEnd.dispatch = () => { s.advance(10000); scoreDuration = s.game.playTime.elapsedMs; };
    s.game.end(); expect(scoreDuration).toBe(3500);
    s.manager.doGameTurn(0); s.advance(10000); expect(s.game.playTime.elapsedMs).toBe(3500);
    s.manager.dispose();
    const errored = simulation(); errored.game.start(); errored.manager.doGameTurn(0); errored.advance(700);
    errored.manager.setErrorState(); errored.advance(50000); expect(errored.game.playTime.elapsedMs).toBe(700);
    errored.manager.dispose();
});

test('campaign and skirmish share the pause clock while campaign restoration and blocking media remain excluded', () => {
    expect(CampaignPlayTime).toBe(PhysicalPlayTime);
    const s = simulation(); s.game.campaign = { playTime: s.game.playTime, restoring: true, journal: { record() {} } };
    s.game.start(); s.manager.doGameTurn(0); s.advance(80000); expect(s.game.playTime.elapsedMs).toBe(0);
    s.game.campaign.restoring = false; s.manager.doGameTurn(0); s.advance(1100);
    s.manager.setCampaignPaused(true); s.advance(5000); expect(s.game.playTime.elapsedMs).toBe(1100);
    s.manager.setCampaignPaused(false); s.advance(900); s.game.campaign.result = 'victory';
    s.manager.doGameTurn(0); s.advance(40000); expect(s.game.playTime.elapsedMs).toBe(2000); s.manager.dispose();
});

test('measured skirmish time survives exact save reconstruction, continued play and repeated saving', async () => {
    const s = simulation(); s.game.start(); s.manager.doGameTurn(0); s.advance(1423);
    s.game.desiredSpeed.value = 3; s.manager.doGameTurn(0); s.advance(577); s.manager.setPaused(true);
    const save = s.journal.capture(s.game, s.game.speed.value, 'Measured', 'clock-slot');
    expect(save.playTime?.elapsedMs).toBe(2000);
    const target = simulation(save);
    await restoreSkirmish(target.game, target.player, {}, save, () => target.advance(60000));
    expect(target.game.getHash()).toBe(s.game.getHash()); expect(target.game.playTime.elapsedMs).toBe(2000);
    target.advance(20000); expect(target.game.playTime.elapsedMs).toBe(2000);
    target.manager.doGameTurn(0); target.advance(345); target.manager.setPaused(true);
    const again = target.journal.capture(target.game, target.game.speed.value, 'Again', 'clock-slot-2');
    expect(again.playTime?.elapsedMs).toBe(2345);
    s.manager.dispose(); target.manager.dispose();
});

test('legacy skirmish saves retain readable timing estimates from their nonmonotonic recorded speeds', async () => {
    expect(legacySkirmishPlayTime({ tick: 450, initialSpeed: 1,
        speeds: [{ tick: 0, value: 1 }, { tick: 150, value: 2 }, { tick: 300, value: .5 }] })).toBe(35000);
    expect(legacySkirmishPlayTime({ tick: 150, initialSpeed: 2, speeds: [] })).toBe(5000);
    const s = simulation(); s.game.start(); for (let i = 0; i < 15; i++) s.manager.doGameTurn(0);
    const save = s.journal.capture(s.game, 1, 'Legacy', 'legacy-slot'); delete save.playTime;
    validateSave(save);
    const target = simulation(save); await restoreSkirmish(target.game, target.player, {}, save, () => {});
    expect(target.game.playTime.elapsedMs).toBe(1000); expect(target.game.getHash()).toBe(save.hash);
    for (const value of [null, { elapsedMs: -1 }, { elapsedMs: Infinity }, { elapsedMs: '100' }]) {
        const invalid = { ...save, playTime: value } as any; expect(() => validateSave(invalid)).toThrow('HD:SaveInvalid');
    }
    s.manager.dispose(); target.manager.dispose();
});
