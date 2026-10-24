import { expect, test } from 'bun:test';
import { SkirmishSaveJournal, restoreSkirmish, saveChecksum, validateSave } from '../../src/gui/save/SkirmishSave';
import { SoloPlayTurnManager } from '../../src/network/gamestate/SoloPlayTurnManager';
import { BoxedVar } from '../../src/util/BoxedVar';

function simulation() {
    const game: any = { speed: new BoxedVar(4), desiredSpeed: new BoxedVar(4), status: 0, currentTick: 0,
        credits: 1000, ai: { pending: 0 }, localPlayer: {},
        start() { this.status = 1; this.currentTick = 0; },
        update() { this.credits += this.ai.pending; this.ai.pending = this.currentTick % 7; this.currentTick++; },
        getHash() { return this.credits * 1000 + this.ai.pending * 100 + this.currentTick; } };
    const create = () => ({ actionType: 9, amount: 0, player: undefined,
        serialize() { return new Uint8Array([this.amount]); },
        unserialize(data) { this.amount = data[0]; },
        process() { game.credits -= this.amount; }, print() { return ''; } });
    const factory = { create };
    const pending: any[] = [];
    const journal = new SkirmishSaveJournal({ edition: 'yr', engineVersion: 'test', modHash: '',
        gameId: 'seed', gameTimestamp: 1700000000000, gameOpts: { mapName: 'test.map', humanPlayers: [{ name: 'Player' }] },
        playerName: 'Player', mapData: 'dGVzdA==', initialSpeed: 4 });
    const manager = new SoloPlayTurnManager(game, game.localPlayer, { dequeueAll: () => pending.splice(0) }, undefined, undefined, journal);
    manager.init(); game.start();
    return { game, factory, journal, manager, pending };
}

test('save reconstructs every command and AI pending work at the exact boundary, including speed changes', async () => {
    const source = simulation();
    for (let tick = 0; tick < 705; tick++) {
        if (tick % 17 === 0) { const action = source.factory.create(); action.amount = 7; source.pending.push(action); }
        if (tick === 104) source.game.desiredSpeed.value = 2;
        source.manager.doGameTurn(0);
    }
    const save = source.journal.capture(source.game, 2, 'Checkpoint', 'slot');
    const target = simulation();
    await restoreSkirmish(target.game, target.game.localPlayer, target.factory, save, () => {});
    expect(target.game.currentTick).toBe(705);
    expect(target.game.getHash()).toBe(save.hash);
    expect(target.game.ai).toEqual(source.game.ai);
    expect(target.game.speed.value).toBe(2);
    for (let i = 0; i < 50; i++) { source.game.update(); target.game.update(); }
    expect(target.game.getHash()).toBe(source.game.getHash());
    source.manager.dispose(); target.manager.dispose();
});

test('a paused turn cannot consume queued input or advance the simulation', () => {
    const f = simulation(), action = f.factory.create();
    f.pending.push(action); f.manager.setPaused(true);
    expect(f.manager.doGameTurn(0)).toBe(false);
    expect(f.pending).toHaveLength(1); expect(f.game.currentTick).toBe(0);
    f.manager.setPaused(false); expect(f.manager.doGameTurn(0)).toBe(true);
    expect(f.game.currentTick).toBe(1); expect(action.player).toBe(f.game.localPlayer);
    f.manager.dispose();
});

test('restore rejects damaged state and cancellation, and incomplete command streams cannot be saved', async () => {
    const f = simulation(); f.manager.doGameTurn(0);
    const save = f.journal.capture(f.game, 4, 'Checkpoint', 'slot');
    const checksum = saveChecksum(save);
    save.hash++;
    expect(saveChecksum(save)).not.toBe(checksum);
    const target = simulation();
    await expect(restoreSkirmish(target.game, {}, target.factory, save, () => {})).rejects.toThrow('HD:SaveRestoreMismatch');
    await expect(restoreSkirmish(target.game, {}, target.factory, save, () => {}, {
        throwIfCancelled() { throw new Error('cancelled'); },
    })).rejects.toThrow('cancelled');
    expect(() => validateSave({ ...save, edition: 'ra2' }, 'yr')).toThrow('HD:SaveEditionMismatch');
    expect(() => validateSave({ ...save, actions: [{ tick: 1, type: 9, data: [0] }] })).toThrow('HD:SaveInvalid');
    expect(() => validateSave({ ...save, version: 2 } as any)).toThrow('HD:SaveIncompatible');
    f.journal.invalidate();
    expect(() => f.journal.capture(f.game, 4, 'Bad')).toThrow('HD:SaveModified');
    f.manager.dispose(); target.manager.dispose();
});
