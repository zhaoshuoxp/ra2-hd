import { expect, test } from 'bun:test';
import { CampaignJournal, canonicalCampaignWorld } from '../../src/game/campaign/CampaignCheckpoint';
import { Prng } from '../../src/game/Prng';
import { ActionQueue } from '../../src/game/action/ActionQueue';
import { SoloPlayTurnManager } from '../../src/network/gamestate/SoloPlayTurnManager';

test('migrates only frozen trait-name aliases without discarding nested world state', () => {
    const legacy = { traits: { Zs: { hitPoints: 75 }, ws: { units: [{ traits: { qs: { deployed: true } } }] } }, extra: 42 };
    expect(canonicalCampaignWorld(legacy)).toEqual({ traits: { HealthTrait: { hitPoints: 75 },
        GarrisonTrait: { units: [{ traits: { DeployerTrait: { deployed: true } } }] } }, extra: 42 });
    expect(canonicalCampaignWorld({ traits: { unknown: { hitPoints: 76 } } })).toEqual({ traits: { unknown: { hitPoints: 76 } } });
    expect(() => canonicalCampaignWorld({ traits: { Zs: {}, HealthTrait: {} } })).toThrow('Duplicate');
});

function world(source = 'a'.repeat(64)) {
    const player = { credits: 1000 }, prng = new Prng(42);
    const game: any = { id: 'fixture', startTimestamp: 123, currentTick: 0, status: 1, afterTickCallbacks: [],
        position: 0, velocity: 0, countdown: 30, prng,
        gameOpts: { campaign: { edition: 'ra2', mission: 'sov01t.map', sourceSha256: source, provenanceDigest: 'b'.repeat(64) } },
        campaign: { restoring: false, checkpointState: () => ({ countdown: game.countdown }) },
        getAllPlayers: () => [player], getPlayerNumber: (p: any) => { if (p !== player) throw new Error('Wrong player'); return 0; }, getPlayer: () => player,
        getHash: () => game.position + game.velocity * 100 + player.credits,
        update: () => { game.position += game.velocity; game.countdown--; player.credits += prng.generateRandomInt(0, 2); game.currentTick++; } };
    const factory = { create: (type: number) => ({ player, delta: 0, actionType: type,
        unserialize(bytes: Uint8Array) { this.delta = bytes[0]; }, serialize() { return new Uint8Array([this.delta]); },
        process() { game.velocity = this.delta; this.player.credits -= 5; } }) };
    return { game, player, factory, journal: new CampaignJournal() };
}

test('YR31 preserves queued player input at the exact saved tick and applies it once after resuming', async () => {
    const prepare = () => {
        const result = world(), queue = new ActionQueue();
        Object.assign(result.game.gameOpts.campaign, { edition: 'yr', mission: 'sov02smd.map', semanticsVersion: 31 });
        result.game.campaign.journal = result.journal;
        result.journal.bindInput(result.game, result.player, queue, result.factory);
        return { ...result, queue, manager: new SoloPlayTurnManager(result.game, result.player, queue) };
    };
    const original = prepare(); original.game.update();
    const action = original.factory.create(9); action.delta = 6; original.queue.push(action as any);
    const beforeCredits = original.player.credits;
    const checkpoint = JSON.parse(JSON.stringify(await original.journal.capture(original.game)));
    expect(checkpoint.tick).toBe(1); expect(checkpoint.commands).toEqual([]);
    expect(checkpoint.pendingCommands).toEqual([{ tick: 1, player: 0, type: 9, data: [6] }]);
    expect(original.player.credits).toBe(beforeCredits); expect(original.game.velocity).toBe(0);
    const restored = prepare(); await restored.journal.restore(restored.game, restored.factory, checkpoint);
    restored.journal.bindInput(restored.game, restored.player, restored.queue, restored.factory, checkpoint);
    expect(restored.game.currentTick).toBe(1); expect(restored.game.velocity).toBe(0);
    for (let i = 0; i < 180; i++) { original.manager.doGameTurn(0); restored.manager.doGameTurn(0); }
    const resumed = await restored.journal.capture(restored.game);
    expect(resumed).toEqual(await original.journal.capture(original.game));
    expect(resumed.commands).toEqual([{ tick: 1, player: 0, type: 9, data: [6] }]);
    expect(resumed.pendingCommands).toEqual([]); expect(restored.game.position).toBe(1080);
});

test('legacy campaign saves retain their policy and pending debug commands cannot enter a YR31 save', async () => {
    const old = world(), queue = new ActionQueue();
    old.journal.bindInput(old.game, old.player, queue, old.factory);
    queue.push(old.factory.create(9) as any);
    expect((await old.journal.capture(old.game)).pendingCommands).toBeUndefined();
    Object.assign(old.game.gameOpts.campaign, { edition: 'yr', mission: 'sov02smd.map', semanticsVersion: 31 });
    queue.clear(); queue.push(old.factory.create(4) as any);
    old.journal.bindInput(old.game, old.player, queue, old.factory);
    await expect(old.journal.capture(old.game)).rejects.toThrow('Debug commands');
});

test('rebuilds applied commands, world motion, player money, RNG and mission time across a persisted checkpoint', async () => {
    const original = world();
    for (let tick = 0; tick < 17; tick++) {
        if (tick === 3 || tick === 10) {
            const action = original.factory.create(9); action.delta = tick;
            original.journal.record(original.game, original.player, [action]); action.process();
        }
        original.game.update();
    }
    const checkpoint = JSON.parse(JSON.stringify(await original.journal.capture(original.game)));
    const restored = world(); await restored.journal.restore(restored.game, restored.factory, checkpoint);
    expect([restored.game.position, restored.game.velocity, restored.player.credits, restored.game.countdown])
        .toEqual([original.game.position, original.game.velocity, original.player.credits, original.game.countdown]);
    for (let tick = 0; tick < 11; tick++) { restored.game.update(); original.game.update(); }
    expect(await restored.journal.capture(restored.game)).toEqual(await original.journal.capture(original.game));
});

test('rejects corrupt history, different resource identities, debug mutation and divergent reconstruction', async () => {
    const original = world(); original.game.update(); const checkpoint = await original.journal.capture(original.game);
    const corrupt = structuredClone(checkpoint); corrupt.tick++;
    const fresh = world(); await expect(fresh.journal.restore(fresh.game, fresh.factory, corrupt)).rejects.toThrow('incompatible');
    const changed = world('c'.repeat(64)); await expect(changed.journal.restore(changed.game, changed.factory, checkpoint)).rejects.toThrow('mismatch');
    const divergent = world(); divergent.game.update = () => { divergent.game.currentTick++; };
    await expect(divergent.journal.restore(divergent.game, divergent.factory, checkpoint)).rejects.toThrow('diverged');
    const debug = world(); const action = debug.factory.create(4); debug.journal.record(debug.game, debug.player, [action]);
    await expect(debug.journal.capture(debug.game)).rejects.toThrow('Debug commands');
});

test('cancellation settles replay and refuses to capture pending mission media', async () => {
    const original = world(); original.game.update(); const checkpoint = await original.journal.capture(original.game);
    const fresh = world(); await expect(fresh.journal.restore(fresh.game, fresh.factory, checkpoint, { cancelled: () => true })).rejects.toThrow('cancelled');
    expect(fresh.game.campaign.restoring).toBe(false);
    original.game.campaign.pendingMedia = ['pending']; await expect(original.journal.capture(original.game)).rejects.toThrow('pending');
});

test('loads the frozen key spelling through checksum validation but still rejects changed health', async () => {
    const original = world();
    original.game.debugGetState = () => ({ traits: { HealthTrait: { hitPoints: original.player.credits } } });
    original.game.update();
    const captured = await original.journal.capture(original.game);
    const { checksum: _checksum, ...payload } = captured;
    payload.expected.world = { traits: { Zs: { hitPoints: original.player.credits } } };
    const checksum = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const legacy = { ...payload, checksum: await checksum(payload) }, restored = world();
    restored.game.debugGetState = () => ({ traits: { HealthTrait: { hitPoints: restored.player.credits } } });
    await restored.journal.restore(restored.game, restored.factory, legacy);
    const changed = world(); changed.game.debugGetState = () => ({ traits: { HealthTrait: { hitPoints: 1 } } });
    await expect(changed.journal.restore(changed.game, changed.factory, legacy)).rejects.toThrow('diverged');
});
