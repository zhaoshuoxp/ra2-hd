import { expect, test, spyOn } from 'bun:test';
import { Debris } from '../../src/game/gameobject/Debris';
import { Warhead } from '../../src/game/Warhead';
import { SoundHandler } from '../../src/gui/screen/game/SoundHandler';
import { WarheadDetonateFxHandler } from '../../src/engine/renderable/fx/handler/WarheadDetonateFxHandler';
import { EventType } from '../../src/game/event/EventType';
import { Vector3 } from 'three';

test('debris damage cannot create a lightning strike; actual strikes retain their visual effect', () => {
    const detonate = spyOn(Warhead.prototype, 'detonate').mockImplementation(() => {});
    try {
        const debris = {
            rules: { warhead: 'HE', damage: 10, damageRadius: 40 }, tile: {}, tileElevation: 0,
            position: { worldPosition: new Vector3() }, collisionHelper: { computeDetonationZone: () => 0 },
        };
        const world = { rules: { getWarhead: () => ({ name: 'HE' }) }, destroyObject: () => {}, createTarget: () => ({}) };
        (Debris.prototype as any).detonate.call(debris, world);
        expect(detonate.mock.calls).toHaveLength(1);
        const args = detonate.mock.calls[0];
        expect(args[1]).toBe(10);
        expect(args[11]).toBe(40);
        expect(Boolean(args[12])).toBe(false);
        const animations: string[] = [];
        let listener: any;
        const fx = new WarheadDetonateFxHandler({ events: { subscribe: (_type, callback) => {
            listener = callback; return { dispose() {} };
        } }, rules: { audioVisual: { weatherConBolts: ['BOLT'] } } }, {
            createTransientAnim(name, callback) { animations.push(name); callback?.({ setPosition() {} }); },
        });
        fx.init();
        const event = { position: new Vector3(), target: { rules: {} }, explodeAnim: 'EXPLOSION', isLightningStrike: Boolean(args[12]) };
        listener(event);
        expect(animations).toEqual(['EXPLOSION']);
        listener({ ...event, explodeAnim: undefined, isLightningStrike: true });
        expect(animations).toEqual(['EXPLOSION', 'BOLT']);
        fx.dispose();
    } finally { detonate.mockRestore(); }
});

function fixture() {
    const game = { currentTick: 10 }, plays: any[] = [], frames = new Set<() => void>();
    let listener: any;
    const handler = new SoundHandler(game, {
        isLoopingEffect: (name: string) => name.startsWith('loop'),
        playEffect: (name: string, actor: any) => {
            const handle = { playing: true, stops: 0, isPlaying() { return this.playing; }, stop() { this.playing = false; this.stops++; } };
            plays.push({ name, actor, handle }); return handle;
        },
    }, {}, {}, { subscribe(callback: any) { listener = callback; return { dispose() {} }; } }, {}, {}, {}, {
        onFrame: { subscribe: (callback: any) => frames.add(callback), unsubscribe: (callback: any) => frames.delete(callback) },
    });
    handler.init();
    const actor = () => ({ isSpawned: true, isDestroyed: false, owner: {}, position: { worldPosition: {} },
        attackTrait: { idle: false, disabled: false, isIdle() { return this.idle; }, isDisabled() { return this.disabled; } } });
    const fire = (unit: any, name = 'loop-stage-1') => listener({ type: EventType.WeaponFire, gameObject: unit,
        weapon: { rof: 10, rules: { report: [name] }, warhead: { rules: {} } } });
    return { game, plays, frames, handler, actor, fire, frame: () => frames.forEach(f => f()) };
}

test('continuous fire reuses one loop, switches stages, and stops on idle', () => {
    const f = fixture(), unit = f.actor();
    for (let i = 0; i < 20; i++) { f.game.currentTick++; f.fire(unit); f.frame(); }
    expect(f.plays).toHaveLength(1);
    expect(f.plays[0].actor).toBe(unit);
    f.fire(unit, 'loop-stage-2');
    expect(f.plays).toHaveLength(2);
    expect(f.plays[0].handle.stops).toBe(1);
    unit.attackTrait.idle = true; f.frame();
    expect(f.plays[1].handle.stops).toBe(1);
    f.frame(); expect(f.plays[1].handle.stops).toBe(1);
    f.handler.dispose(); expect(f.frames.size).toBe(0);
});

test('loops end on lost fire cadence, disabled weapons, removal, ownership change, and disposal', () => {
    for (const reason of ['cadence', 'disabled', 'removed', 'destroyed', 'owner', 'dispose']) {
        const f = fixture(), unit = f.actor(), other = f.actor();
        f.fire(unit); f.fire(other);
        if (reason === 'cadence') { f.game.currentTick += 12; f.fire(other); }
        if (reason === 'disabled') unit.attackTrait.disabled = true;
        if (reason === 'removed') unit.isSpawned = false;
        if (reason === 'destroyed') unit.isDestroyed = true;
        if (reason === 'owner') unit.owner = {};
        if (reason === 'dispose') f.handler.dispose(); else f.frame();
        expect(f.plays[0].handle.playing).toBe(false);
        expect(f.plays[1].handle.playing).toBe(reason !== 'dispose');
        f.handler.dispose();
    }
});

test('ordinary one-shot reports still play on every shot', () => {
    const f = fixture(), unit = f.actor();
    f.fire(unit, 'one-shot'); f.fire(unit, 'one-shot');
    unit.attackTrait.idle = true; f.frame(); f.handler.dispose();
    expect(f.plays).toHaveLength(2);
    expect(f.plays.every(p => p.handle.stops === 0)).toBe(true);
});
