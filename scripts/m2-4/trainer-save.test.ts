import { expect, test } from 'bun:test';
import { TrainerSession, tickTrainer, trainerProtects, type TrainerCommand } from '../../src/game/trainer/TrainerRuntime';
import { SkirmishSaveJournal, restoreSkirmish, validateSave } from '../../src/gui/save/SkirmishSave';
import { BoxedVar } from '../../src/util/BoxedVar';

function simulation(saved?: any) {
    const player: any = { credits: 1000, defeated: false, powerTrait: { supply: 0,
        setTrainerSupply(value: number) { this.supply = value; } } };
    const object: any = { id: 7, owner: player, isSpawned: true, isTechno: () => true,
        healthTrait: { value: 20, getHitPoints() { return this.value; }, healToFull() { this.value = 100; } } };
    const game: any = { status: 0, currentTick: 0, localPlayer: player, ai: 0,
        speed: new BoxedVar(1), desiredSpeed: new BoxedVar(1),
        getWorld: () => ({ hasObjectId: (id: number) => id === object.id, getObjectById: (id: number) => id === object.id ? object : undefined }),
        start() { this.status = 1; this.currentTick = 0; },
        update() { tickTrainer(this); player.credits += this.ai; this.ai = this.currentTick % 7; this.currentTick++; },
        getHash() { return player.credits * 10000 + this.ai * 100 + object.healthTrait.value + player.powerTrait.supply; } };
    const journal = new SkirmishSaveJournal({ edition: 'ra2', engineVersion: 'test', modHash: '',
        gameId: 'seed', gameTimestamp: 1700000000000, gameOpts: { mapName: 'test.map', humanPlayers: [{ name: 'Player' }] },
        playerName: 'Player', mapData: 'dGVzdA==', initialSpeed: 1 }, saved);
    let enabled = false, recording = !saved;
    const session = new TrainerSession(game, player, 'ra2', () => enabled, () => true, () => {}, () => {},
        (command, phase) => { if (recording) journal.recordTrainer(game, command, phase); });
    const setEnabled = (value: boolean) => { if (!value) session.reset(); enabled = value; };
    const send = (command: TrainerCommand) => session.dispatch({ session: session.id, edition: 'ra2', actor: player, command });
    const ticks = (count: number) => { for (let i = 0; i < count; i++) { journal.beforeTick(game, []); game.update(); } };
    game.start();
    return { game, player, object, journal, session, send, setEnabled, ticks,
        restored() { recording = true; }, trainer: { session, setEnabled } };
}

test('trainer operations, immediate reset, protected identities and paused pending commands survive repeated save/restore', async () => {
    const source = simulation(); source.setEnabled(true);
    source.send({ type: 'credits', mode: 'add', value: 5000 });
    source.send({ type: 'effect', effect: 'minimum', enabled: true, value: 8000 });
    source.send({ type: 'effect', effect: 'power', enabled: true, value: 1000 });
    source.send({ type: 'heal', targets: [source.object] });
    source.ticks(300);
    source.setEnabled(false); // Reset at the same boundary as the next checkpoint.
    source.setEnabled(true);
    source.send({ type: 'protect', targets: [source.object] });
    source.send({ type: 'effect', effect: 'production', enabled: true, value: 1 });
    source.ticks(5);
    source.send({ type: 'credits', mode: 'add', value: 100 }); // Still queued while paused.
    const save = source.journal.capture(source.game, 1, 'Trainer', 'slot');
    expect(save.trainer?.pending).toEqual([{ type: 'credits', mode: 'add', value: 100 }]);
    expect(save.trainer?.events.find(event => event.command.type === 'reset')).toMatchObject({ tick: 300, phase: 'boundary' });
    const target = simulation(save);
    await restoreSkirmish(target.game, target.player, {}, save, () => {}, undefined, target.trainer);
    target.restored();
    expect(target.game.getHash()).toBe(source.game.getHash());
    expect(target.session.effects).toEqual(source.session.effects);
    expect(trainerProtects(target.game, target.object)).toBe(true);
    expect(target.session.pending).toBe(1);
    expect(target.session.protectedObjects.has(source.object)).toBe(false);
    source.ticks(25); target.ticks(25);
    expect(target.game.getHash()).toBe(source.game.getHash());
    const secondSave = target.journal.capture(target.game, 1, 'Again', 'slot2');
    const second = simulation(secondSave);
    await restoreSkirmish(second.game, second.player, {}, secondSave, () => {}, undefined, second.trainer);
    expect(second.game.getHash()).toBe(source.game.getHash());
    expect(second.session.effects).toEqual(source.session.effects);
    for (const current of [source, target, second]) current.session.dispose();
});

test('trainer journal validates IDs, boundary ordering, disabled queues and unknown effects before replay', () => {
    const source = simulation(); source.setEnabled(true);
    source.send({ type: 'credits', mode: 'set', value: 2000 }); source.ticks(1);
    const save = source.journal.capture(source.game, 1, 'Trainer', 'slot');
    for (const command of [{ type: 'protect', targets: [-1] }, { type: 'effect', effect: 'unknown', enabled: true },
        { type: 'credits', mode: 'add', value: Infinity }]) {
        const broken = structuredClone(save); broken.trainer!.events[0].command = command as any;
        expect(() => validateSave(broken)).toThrow('HD:SaveInvalid');
    }
    const disabled = structuredClone(save); disabled.trainer!.enabled = false;
    disabled.trainer!.pending.push({ type: 'ready' });
    expect(() => validateSave(disabled)).toThrow('HD:SaveInvalid');
    const boundary = structuredClone(save);
    boundary.trainer!.events.push({ tick: 0, phase: 'boundary', command: { type: 'reset' } });
    expect(() => validateSave(boundary)).toThrow('HD:SaveInvalid');
    source.session.dispose();
});
