import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CampaignPlayTime } from '../../src/game/campaign/CampaignPlayTime';
import { CampaignJournal } from '../../src/game/campaign/CampaignCheckpoint';
import { campaignChargedWeaponRange, canCampaignChargeTarget, campaignChargeApproach } from '../../src/game/campaign/CampaignChargedWeapon';
import { TrainerSession, tickTrainer, trainerProtects } from '../../src/game/trainer/TrainerRuntime';
import { validSavedTrainer } from '../../src/game/trainer/TrainerSave';
import { WeaponTargeting } from '../../src/game/WeaponTargeting';
import { WeaponType } from '../../src/game/WeaponType';
import { LandTargeting } from '../../src/game/type/LandTargeting';
import { constructionSlopePositions } from '../../src/engine/renderable/unitVxl/componentGeometry';
import { Prng } from '../../src/game/Prng';
import { CampaignSpeechQueue } from '../../src/gui/campaign/CampaignSpeechQueue';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';

test('physical play time survives pause, arbitrary simulation speeds and restoration without adding replay time', () => {
    let now = 1000; const clock = new CampaignPlayTime(() => now);
    now += 5000; expect(clock.elapsedMs).toBe(0);
    clock.setRunning(true); now += 1250; clock.setRunning(true); now += 750;
    expect(clock.elapsedMs).toBe(2000); clock.setRunning(false); now += 300000;
    expect(clock.elapsedMs).toBe(2000); clock.restore(4321); now += 90000;
    expect(clock.elapsedMs).toBe(4321); clock.setRunning(true); now += 679;
    expect(clock.elapsedMs).toBe(5000); clock.setRunning(false);
    expect(() => clock.restore(NaN)).toThrow('Invalid'); expect(() => clock.restore(-1)).toThrow('Invalid');
});

test('ordinary Tesla charging accepts the allied campaign receiver and preserves legacy/skirmish modifiers', () => {
    const owner: any = { campaignSemanticsVersion: 7, campaignChargingVersion: 1 }, ally = {}, enemy = {};
    const shooter: any = { name: 'SHK', owner, rules: { landTargeting: LandTargeting.LandOk } };
    const receiver: any = { owner: ally, isBuilding: () => true, isUnit: () => false, overpoweredTrait: {}, campaignMapWeaponRange: 512 };
    const relations: any = { areFriendly: (_a: any, b: any) => b.owner !== enemy };
    const targeting = new WeaponTargeting(WeaponType.Secondary, { isAntiGround: true, isAntiAir: false },
        { damage: 10 }, { electricAssault: true }, shooter, { prism: { type: 'ATESLA' } });
    expect(targeting.canTarget(receiver, undefined, relations, false, false)).toBe(true);
    const controller = {}; owner.campaignController = controller;
    const directed: any = { areFriendly: (a: any, b: any) => a.owner === controller && b.owner === ally };
    expect(targeting.canTarget(receiver, undefined, directed, false, false)).toBe(true);
    receiver.owner = enemy; expect(targeting.canTarget(receiver, undefined, relations, true, false)).toBe(false);
    receiver.owner = ally; receiver.campaignMapWeaponRange = undefined;
    expect(canCampaignChargeTarget(shooter, receiver, relations)).toBe(false);
    receiver.owner = owner; owner.campaignChargingVersion = undefined;
    expect(targeting.canTarget(receiver, undefined, relations, false, false)).toBe(false);
    expect(targeting.canTarget(receiver, undefined, relations, true, false)).toBe(true);
});

test('whole-map range requires the exact charged Eiffel weapon and disappears with charging or power loss', () => {
    let charged = true, powered = true;
    const tower: any = { owner: { campaignSemanticsVersion: 7, campaignChargingVersion: 1 }, campaignMapWeaponRange: 512,
        overpoweredTrait: { hasChargersToPowerOn: () => charged }, poweredTrait: { isPoweredOn: () => powered } };
    const weapon = { rules: { name: 'EiffelBolt' } };
    expect(campaignChargedWeaponRange(tower, weapon)).toBe(512);
    charged = false; expect(campaignChargedWeaponRange(tower, weapon)).toBeUndefined();
    charged = true; powered = false; expect(campaignChargedWeaponRange(tower, weapon)).toBeUndefined();
    powered = true; expect(campaignChargedWeaponRange(tower, { rules: { name: 'CoilBolt' } })).toBeUndefined();
    tower.owner.campaignChargingVersion = undefined; expect(campaignChargedWeaponRange(tower, weapon)).toBeUndefined();
});

test('charged map acquisition overrides an explicit guard scan radius and restores it when power is lost', () => {
    let powered = true, radius = 0;
    const tower: any = { owner: { campaignChargingVersion: 1 }, campaignMapWeaponRange: 200, rules: {},
        overpoweredTrait: { hasChargersToPowerOn: () => true }, poweredTrait: { isPoweredOn: () => powered } };
    const weapon = { rules: { name: 'EiffelBolt' } };
    const trait: any = { getAvailableWeapons: () => [], scanTechnosAround: (_a: any, r: number) => { radius = r; return []; } };
    AttackTrait.prototype.scanForTarget.call(trait, tower, weapon, {}, 8);
    expect(radius).toBe(200); powered = false;
    AttackTrait.prototype.scanForTarget.call(trait, tower, weapon, {}, 8); expect(radius).toBe(8);
});

test('an energized map salvo fires the actual weapon at every valid hostile unit while respecting cooldown', () => {
    const shots: number[] = []; let cooldown = false;
    const human = {}, tower: any = { owner: { campaignChargingVersion: 1, campaignController: human },
        campaignMapWeaponRange: 200, overpoweredTrait: { hasChargersToPowerOn: () => true },
        poweredTrait: { isPoweredOn: () => true }, unitOrderTrait: { hasTasks: () => false } };
    const units = [1, 2, 3].map(id => ({ id, owner: {}, tile: {}, isUnit: () => true }));
    const weapon = { rules: { name: 'EiffelBolt' }, fire: (target: any) => shots.push(target.obj.id) };
    const trait: any = { selectDefaultWeapon: () => weapon, isDisabled: () => false, isOnCooldown: () => cooldown,
        scanTechnosAround: () => units, selectWeaponFromList: () => weapon, rangeHelper: { isInWeaponRange: () => true } };
    const game: any = { isValidTarget: () => true, areFriendly: (_a: any, target: any) => target.id === 2,
        createTarget: (obj: any) => ({ obj }) };
    AttackTrait.prototype[NotifyTick.onTick].call(trait, tower, game); expect(shots).toEqual([1, 3]);
    cooldown = true; AttackTrait.prototype[NotifyTick.onTick].call(trait, tower, game); expect(shots).toEqual([1, 3]);
});

test('charging walks an original ownership-entry ring without forcing its events, house change or timer', () => {
    const human = {}, owner: any = { campaignChargingVersion: 1, campaignController: human };
    const shooter = { owner, tile: { rx: 15, ry: 20 } }, receiver: any = { owner: { isAi: true },
        tile: { rx: 20, ry: 20 }, tag: { id: 'receiver-tag' }, campaignMapWeaponRange: 200,
        isBuilding: () => true, overpoweredTrait: {} };
    const state = { enabled: true, fired: 0 };
    const definition = { tags: new Map([['receiver-tag', { trigger: 'handoff' }], ['ring-tag', { trigger: 'entered' }]]),
        triggers: new Map([['handoff', { id: 'handoff', events: [{ opcode: 13, params: ['0', '1'] }], actions: [{ opcode: 14, params: ['0', '20'] }] }],
            ['entered', { id: 'entered', events: [{ opcode: 1, params: ['0', '20'] }], actions: [{ opcode: 53, params: ['2', 'handoff'] }] }]]),
        cellTags: [{ x: 19, y: 20, tag: 'ring-tag' }, { x: 20, y: 24, tag: 'ring-tag' }],
        triggerChain: (id: string): string[] => [id] };
    const game: any = { areFriendly: (a: any) => a.owner === human,
        map: { tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry }) } },
        campaign: { definition, resolveHouse: () => owner, machine: { states: new Map([['entered', state]]) } } };
    expect(campaignChargeApproach(game, shooter, receiver)).toEqual({ tile: { rx: 19, ry: 20 }, wait: 17 });
    expect(state).toEqual({ enabled: true, fired: 0 }); expect(receiver.owner.isAi).toBe(true);
    state.fired = 1; expect(campaignChargeApproach(game, shooter, receiver)).toBeUndefined();
});

test('pitched construction surfaces retain every level pixel and keep the whole body on one plane in all bearings', () => {
    const camera = new THREE.OrthographicCamera(); camera.rotation.set(-Math.atan(.5), Math.PI / 4, 0, 'YXZ');
    const view = new THREE.Matrix4().makeRotationFromQuaternion(camera.quaternion), inverse = view.clone().invert();
    const screen = [[-20, -10, 8], [0, -10, 0], [20, -10, -6], [-20, 10, 8], [0, 10, 0], [20, 10, -6]];
    const positions = new THREE.Float32BufferAttribute(screen.flatMap(p => new THREE.Vector3(...p).applyMatrix4(view).toArray()), 3);
    for (let yaw = 0; yaw < 360; yaw += 45) {
        const reference = new THREE.Matrix4().makeRotationY(yaw * Math.PI / 180).elements;
        const values = constructionSlopePositions(positions, reference, camera);
        const recovered = Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromArray(values, i * 3));
        const normal = recovered[1].clone().sub(recovered[0]).cross(recovered[3].clone().sub(recovered[0])).normalize();
        recovered.forEach((p, i) => {
            expect(Math.abs(normal.dot(p.clone().sub(recovered[0])))).toBeLessThan(.0001);
            const projected = p.clone().applyMatrix4(inverse);
            expect(projected.x).toBeCloseTo(screen[i][0], 4); expect(projected.y).toBeCloseTo(screen[i][1], 4);
        });
        for (const pitch of [-25, 25]) {
            const rotation = new THREE.Matrix4().makeRotationX(pitch * Math.PI / 180);
            const moved = recovered.map(p => p.clone().applyMatrix4(rotation));
            expect(moved[0].distanceTo(moved[5])).toBeCloseTo(recovered[0].distanceTo(recovered[5]), 5);
        }
    }
});

function trainerWorld() {
    let enabled = true, now = 5000;
    const player: any = { credits: 1000, supply: 0, powerTrait: { setTrainerSupply: (value: number) => player.supply = value } };
    const actor: any = { id: 1, owner: player, isSpawned: true, isTechno: () => true,
        healthTrait: { getHitPoints: () => 50, healToFull: () => { actor.healed = true; } } };
    const journal = new CampaignJournal(), prng = new Prng(42), clock = new CampaignPlayTime(() => now);
    const game: any = { id: 'trainer-fixture', startTimestamp: 123, status: 1, currentTick: 0, currentTime: 0,
        localPlayer: player, afterTickCallbacks: [], prng, desiredSpeed: { value: 4.5 }, speed: { value: 4.5 },
        gameOpts: { campaign: { edition: 'ra2', mission: 'sov01t.map', sourceSha256: 'a'.repeat(64), provenanceDigest: 'b'.repeat(64) } },
        campaign: { restoring: false, playTime: clock, checkpointState: () => ({ timer: 50 - game.currentTick }) },
        getAllPlayers: () => [player], getPlayer: () => player, getPlayerNumber: () => 0,
        getWorld: () => ({ hasObjectId: (id: number) => id === 1, getObjectById: () => actor }),
        getHash: () => player.credits + player.supply + game.currentTick + (actor.healed ? 1000 : 0),
        debugGetState: () => ({ credits: player.credits, supply: player.supply, healed: !!actor.healed }),
        update: () => { tickTrainer(game); player.credits += prng.generateRandomInt(0, 2); game.currentTick++; game.currentTime += 1000 / 15; } };
    const session = new TrainerSession(game, player, 'ra2', () => enabled, () => true, () => {}, () => {},
        (command, phase) => journal.recordTrainer(game, command, phase));
    const dispatch = (command: any) => expect(session.dispatch({ session: session.id, edition: 'ra2', actor: player, command })).toBe(true);
    return { game, player, actor, journal, session, dispatch, setEnabled: (value: boolean) => enabled = value,
        time: (value: number) => { now = value; } };
}

test('campaign journal restores trainer effects, protection, boundary reset, pending commands, RNG and physical time', async () => {
    const original = trainerWorld();
    original.dispatch({ type: 'credits', mode: 'add', value: 5000 }); original.game.update();
    original.dispatch({ type: 'protect', targets: [original.actor] }); original.game.update();
    original.session.reset(); original.game.update();
    original.dispatch({ type: 'effect', effect: 'minimum', enabled: true, value: 20000 });
    original.dispatch({ type: 'effect', effect: 'power', enabled: true, value: 1500 });
    original.dispatch({ type: 'protect', targets: [original.actor] }); original.game.update();
    original.dispatch({ type: 'heal', targets: [original.actor] });
    original.game.campaign.playTime.restore(9123);
    const save = JSON.parse(JSON.stringify(await original.journal.capture(original.game)));
    expect(save.trainer.pending).toEqual([{ type: 'heal', targets: [1] }]); expect(save.playTime.elapsedMs).toBe(9123);
    const restored = trainerWorld();
    await restored.journal.restore(restored.game, {}, save, { trainer: restored });
    expect(restored.session.effects).toEqual(original.session.effects);
    expect(restored.session.protectedObjects.has(restored.actor)).toBe(true);
    expect(restored.session.pending).toBe(1); expect(restored.game.campaign.playTime.elapsedMs).toBe(9123);
    for (let i = 0; i < 15; i++) { original.game.update(); restored.game.update(); }
    const after = await restored.journal.capture(restored.game), expected = await original.journal.capture(original.game);
    expect(after.expected).toEqual(expected.expected); expect(after.trainer).toEqual(expected.trainer);
    expect(after.playTime).toEqual(expected.playTime); expect(restored.actor.healed).toBe(true);
    original.session.dispose(); restored.session.dispose();
});

test('legacy time estimates use the selected solo speed and upgraded saves retain the measured extension', async () => {
    const original = trainerWorld(); for (let i = 0; i < 10; i++) original.game.update();
    const { checksum, playTime, trainer, ...payload } = await original.journal.capture(original.game);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const legacy = { ...payload, checksum: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('') };
    const restored = trainerWorld(); restored.game.speed.value = 2 / 3;
    await restored.journal.restore(restored.game, {}, legacy, { legacyPlaySpeed: 1.5 });
    const expected = original.game.currentTime / 1.5;
    expect(restored.game.campaign.playTime.elapsedMs).toBeCloseTo(expected, 8);
    const upgraded = await restored.journal.capture(restored.game), again = trainerWorld();
    await again.journal.restore(again.game, {}, upgraded, { legacyPlaySpeed: 7.5, trainer: again });
    expect(again.game.campaign.playTime.elapsedMs).toBeCloseTo(expected, 8);
    original.session.dispose(); restored.session.dispose(); again.session.dispose();
});

test('trainer saves reject malformed event order and disabled pending commands before reconstruction', () => {
    const valid: any = { version: 1, enabled: true, events: [{ tick: 1, phase: 'boundary', command: { type: 'reset' } },
        { tick: 1, phase: 'tick', command: { type: 'credits', mode: 'add', value: 1 } }], pending: [] };
    expect(validSavedTrainer(valid, 2)).toBe(true);
    expect(validSavedTrainer({ ...valid, events: [...valid.events].reverse() }, 2)).toBe(false);
    expect(validSavedTrainer({ ...valid, enabled: false, pending: [{ type: 'reveal' }] }, 2)).toBe(false);
    expect(validSavedTrainer({ ...valid, events: [null] }, 2)).toBe(false);
    expect(validSavedTrainer({ ...valid, events: [{ tick: 2, phase: 'tick', command: { type: 'reveal' } }] }, 2)).toBe(false);
});

test('campaign trainer protection follows the original human controller while skirmish still requires exact ownership', () => {
    const fixture = trainerWorld(); fixture.actor.owner = { campaignController: fixture.player };
    fixture.dispatch({ type: 'protect', targets: [fixture.actor] }); fixture.game.update();
    expect(trainerProtects(fixture.game, fixture.actor)).toBe(true);
    expect(fixture.session.canTransfer(fixture.actor)).toBe(false);
    const campaign = fixture.game.campaign; fixture.game.campaign = undefined;
    expect(trainerProtects(fixture.game, fixture.actor)).toBe(false);
    expect(fixture.session.dispatch({ session: fixture.session.id, edition: 'ra2', actor: fixture.player,
        command: { type: 'heal', targets: [fixture.actor] } })).toBe(false);
    fixture.game.campaign = campaign; fixture.session.dispose();
});

test('scripted campaign input locks preserve trainer effects and reject new commands until control returns', () => {
    const fixture = trainerWorld();
    fixture.dispatch({ type: 'effect', effect: 'power', enabled: true, value: 1500 });
    fixture.dispatch({ type: 'protect', targets: [fixture.actor] }); fixture.game.update();
    fixture.game.campaign.inputLocked = true;
    expect(fixture.session.dispatch({ session: fixture.session.id, edition: 'ra2', actor: fixture.player,
        command: { type: 'clearProtection' } })).toBe(false);
    fixture.game.update(); fixture.game.update();
    expect(fixture.session.effects.power).toBe(1500); expect(fixture.player.supply).toBe(1500);
    expect(trainerProtects(fixture.game, fixture.actor)).toBe(true);
    fixture.game.campaign.inputLocked = false;
    fixture.dispatch({ type: 'clearProtection' }); fixture.game.update();
    expect(trainerProtects(fixture.game, fixture.actor)).toBe(false); fixture.session.dispose();
});

test('campaign speech selects authentic VOX localization before the English source annotation', () => {
    for (const language of ['zh-CN', 'zh-TW']) {
        const labels = { ...JSON.parse(readFileSync(`public/res/locale/retail-ra2-${language}.json`, 'utf8')).labels,
            ...JSON.parse(readFileSync(`public/res/locale/${language}.json`, 'utf8')) };
        let subtitle = '';
        const spec = { sound: 'csof001', text: 'English source annotation' };
        const queue = new CampaignSpeechQueue({ getSpec: () => spec }, { getWavFile: () => ({}),
            audioSystem: { setDucking() {}, playWavFile: () => ({ completed: new Promise(() => {}), stop() {} }) } }, {},
            { has: (key: string) => key.toLowerCase() in labels, get: (key: string) => labels[key.toLowerCase()] },
            value => subtitle = value, () => {}, () => {});
        queue.playMission('Mis_Csof001');
        expect(subtitle).toBe(labels['vox:csof001']); expect(subtitle).toMatch(/[\u3400-\u9fff]/);
        queue.dispose();
    }
});
