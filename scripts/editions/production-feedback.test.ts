import { expect, test } from 'bun:test';
import { SoundHandler } from '../../src/gui/screen/game/SoundHandler';
import { EventType } from '../../src/game/event/EventType';
import { SoundKey } from '../../src/engine/sound/SoundKey';
import { SidebarCard } from '../../src/gui/screen/game/component/hud/SidebarCard';
import { SidebarItemStatus as Status } from '../../src/gui/screen/game/component/hud/viewmodel/SidebarModel';
import { DeployOrder } from '../../src/game/order/DeployOrder';

test('waiting items retain a stationary full mask; only active production advances', () => {
    const mesh = { visible: false }; let frame = -1, light = -1;
    const overlay = { setLightMult: (v: number) => { light = v; }, getFrameCount: () => 55,
        setFrame: (v: number) => { frame = v; }, setVisible: (v: boolean) => { mesh.visible = v; }, get3DObject: () => mesh };
    const update = (status: Status, progress = 0) => SidebarCard.prototype.updateProgressOverlay({ status, progress }, overlay);
    update(Status.Idle); expect(mesh.visible).toBe(false);
    for (const progress of [0, .2, .8]) { update(Status.InQueue, progress); expect(frame).toBe(1); expect(mesh.visible).toBe(true); }
    update(Status.Started, .5); expect(frame).toBe(27); expect(mesh.visible).toBe(true);
    update(Status.OnHold, .5); expect(frame).toBe(27);
    update(Status.Ready, 1); expect(mesh.visible).toBe(false);
    update(Status.Idle); expect(mesh.visible).toBe(false);
});

test('unavailable single-instance superweapon construction icons stay shaded without masking usable powers', () => {
    const mesh = { visible: false }; let frame = -1, light = -1;
    const overlay = { setLightMult: (v: number) => { light = v; }, getFrameCount: () => 55,
        setFrame: (v: number) => { frame = v; }, setVisible: (v: boolean) => { mesh.visible = v; }, get3DObject: () => mesh };
    const item = { status: Status.Idle, disabled: true, progress: 0,
        target: { type: 0, rules: { buildLimit: 1, superWeapon: 'NukeSpecial' } } };
    const update = () => SidebarCard.prototype.updateProgressOverlay(item, overlay);
    update(); expect(frame).toBe(1); expect(mesh.visible).toBe(true); expect(light).toBe(0);
    item.disabled = false; update(); expect(frame).toBe(0); expect(mesh.visible).toBe(false); expect(light).toBe(0);
    item.disabled = true; item.status = Status.Ready; update(); expect(mesh.visible).toBe(false);
    item.status = Status.Started; item.progress = .5; update(); expect(frame).toBe(27); expect(light).toBe(0);
    item.status = Status.Idle; item.target.type = 1; update(); expect(mesh.visible).toBe(false);
    item.target.type = 0; item.target.rules.superWeapon = ''; update(); expect(mesh.visible).toBe(false);
    item.target.rules.superWeapon = 'SpyPlaneSpecial'; item.target.rules.buildLimit = Infinity;
    update(); expect(mesh.visible).toBe(false);
});

test('factory voices are owner-specific, do not duplicate CreateSound and do not fire for unrelated spawns', () => {
    const player = {}, calls: any[] = [];
    const worldSound = { playEffect: (...args: any[]) => calls.push(['world', ...args]) };
    const sound = { play: (...args: any[]) => calls.push(['voice', ...args]) };
    const handler: any = new SoundHandler({}, worldSound, {}, sound, {}, {}, {}, player);
    const unit = { owner: player, rules: { voiceSelect: 'ConscriptSelect' }, isTechno: () => true };
    handler.handleGameEvent({ type: EventType.ObjectSpawn, gameObject: unit }); expect(calls).toHaveLength(0);
    handler.handleGameEvent({ type: EventType.FactoryProduceUnit, target: unit });
    expect(calls[0].slice(0, 2)).toEqual(['voice', 'ConscriptSelect']);
    handler.handleGameEvent({ type: EventType.FactoryProduceUnit, target: { ...unit, owner: {} } }); expect(calls).toHaveLength(1);
    const hero = { ...unit, rules: { voiceSelect: 'TanyaSelect', createSound: 'TanyaCreated' } };
    handler.handleGameEvent({ type: EventType.ObjectSpawn, gameObject: hero });
    handler.handleGameEvent({ type: EventType.FactoryProduceUnit, target: hero });
    expect(calls).toHaveLength(2); expect(calls[1].slice(0, 2)).toEqual(['world', 'TanyaCreated']);
});

test('completed vehicle-to-building morph plays at the surviving object, with retail placement fallback', () => {
    const calls: any[] = [], owner = {};
    const handler: any = new SoundHandler({}, { playEffect: (...a: any[]) => calls.push(a) }, {}, {}, {}, {}, {}, owner);
    const from = { isVehicle: () => true, rules: {} }, to = { isBuilding: () => true, owner };
    handler.handleGameEvent({ type: EventType.ObjectMorph, from, to });
    expect(calls).toEqual([[SoundKey.BuildingSlam, to, owner]]);
    handler.handleGameEvent({ type: EventType.ObjectMorph, from: { ...from, rules: { deploySound: 'CustomDeploy' } }, to });
    expect(calls[1]).toEqual(['CustomDeploy', to, owner]);
});

test('deploy feedback describes the resulting stance, including undeploy', () => {
    let deployed = false; const events: any[] = [];
    const source = { rules: {}, isVehicle: () => false, isBuilding: () => false, isInfantry: () => true,
        deployerTrait: { toggleDeployed: () => { deployed = !deployed; }, isDeployed: () => deployed } };
    const order: any = new DeployOrder({ events: { dispatch: (e: any) => events.push(e) } }, false);
    order.sourceObject = source;
    for (let i = 0; i < 2; i++) order.process()[0].onTick(source);
    expect(events.map(e => e.deployType)).toEqual(['deploy', 'undeploy']);
});
