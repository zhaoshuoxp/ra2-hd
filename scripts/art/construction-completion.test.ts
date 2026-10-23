import { test, expect } from 'bun:test';
import { updateBuildingConstructionCompletion as update } from '../../src/engine/renderable/building/BuildingConstructionCompletion';
import { AnimationType as Type } from '../../src/engine/renderable/entity/building/AnimationType';

function fixture(marked = true) {
    const sprite = (visible: boolean, frame: number, completion?: number) => {
        const object = { visible };
        return { builder: { hdOverride: { constructionCompletionFrame: completion }, getFrame: () => frame },
            get3DObject: () => object, setFrame: (value: number) => { frame = value; } };
    };
    const main = sprite(false, 0), bib = sprite(false, 0), assembly = sprite(true, 23, marked ? 24 : undefined);
    const door = sprite(false, 7), active = sprite(false, 12);
    let nativeFrame = 23;
    const clock = { props: { start: 0 }, getCurrentFrame: () => nativeFrame,
        start: () => { throw Error('Native clock must not restart'); } };
    const building = { currentAnimType: Type.BUILDUP, mainObj: main, bib, turret: { visible: false },
        gameObject: { healthTrait: { health: 100 } }, objectRules: {}, powered: true,
        animObjects: new Map([[Type.BUILDUP, [assembly]], [Type.UNBUILD, [assembly]],
            [Type.IDLE, [door]], [Type.ACTIVE, [active]]]),
        animations: new Map([[assembly, clock], [door, { ...clock, props: { start: 2 } }],
            [active, { ...clock, props: { start: 1 } }]]),
        animArtProps: { getByType: () => [{ showWhenUnpowered: false }] },
    };
    return { building, main, bib, assembly, door, active, clock,
        setNativeFrame: (value: number) => { nativeFrame = value; assembly.setFrame(value); } };
}

test('completed assembly publishes retained layers and their true initial poses without restarting clocks', () => {
    const f = fixture();
    update(f.building);
    expect(f.main.get3DObject().visible).toBe(false);
    f.setNativeFrame(24); update(f.building);
    expect(f.main.get3DObject().visible).toBe(true);
    expect(f.bib.get3DObject().visible).toBe(true);
    expect(f.assembly.get3DObject().visible).toBe(false);
    expect(f.door.builder.getFrame()).toBe(2);
    expect(f.active.builder.getFrame()).toBe(1);
    expect(f.clock.getCurrentFrame()).toBe(24);
    f.setNativeFrame(23); update(f.building);
    expect(f.main.get3DObject().visible).toBe(false);
    expect(f.assembly.get3DObject().visible).toBe(true);
    expect(f.assembly.builder.getFrame()).toBe(23);
    expect(f.door.builder.getFrame()).toBe(7);
    expect(f.active.builder.getFrame()).toBe(12);
});

test('controlled displayed terminal uses the same presentation while leaving native time untouched', () => {
    const f = fixture(); f.assembly.setFrame(24); update(f.building);
    expect(f.main.get3DObject().visible).toBe(true);
    expect(f.clock.getCurrentFrame()).toBe(23);
    f.assembly.setFrame(22); update(f.building);
    expect(f.assembly.builder.getFrame()).toBe(22);
    expect(f.clock.getCurrentFrame()).toBe(23);
});

test('native idle transition retains its own visibility and advancing frames', () => {
    const f = fixture(); f.setNativeFrame(24); update(f.building);
    f.building.currentAnimType = Type.IDLE;
    f.main.get3DObject().visible = true; f.door.setFrame(4); f.active.setFrame(5);
    update(f.building);
    expect(f.main.get3DObject().visible).toBe(true);
    expect(f.door.builder.getFrame()).toBe(4);
    expect(f.active.builder.getFrame()).toBe(5);
});

test('Original controls and unmarked accepted artwork receive no presentation changes', () => {
    const f = fixture(false); f.setNativeFrame(24); update(f.building);
    expect(f.main.get3DObject().visible).toBe(false);
    expect(f.assembly.get3DObject().visible).toBe(true);
    expect(f.door.builder.getFrame()).toBe(7);
    f.assembly.builder.hdOverride = undefined as any;
    update(f.building);
    expect(f.assembly.get3DObject().visible).toBe(true);
});

test('aggregate overrides declare completion only for their own assembly member offset', () => {
    const f = fixture(false);
    f.assembly.builder.hdOverride = { constructionCompletionFrames: new Map([[70, 24]]) } as any;
    (f.assembly.builder as any).frameOffset = 70;
    f.setNativeFrame(24); update(f.building);
    expect(f.main.get3DObject().visible).toBe(true);
    f.setNativeFrame(23); update(f.building);
    (f.assembly.builder as any).frameOffset = 0;
    f.setNativeFrame(24); update(f.building);
    expect(f.main.get3DObject().visible).toBe(false);
    expect(f.assembly.get3DObject().visible).toBe(true);
});

test('destruction and unpowered active layers are not made visible by completion', () => {
    const f = fixture(); f.setNativeFrame(24); f.building.powered = false; update(f.building);
    expect(f.active.get3DObject().visible).toBe(false);
    f.building.gameObject.healthTrait.health = 0; update(f.building);
    expect(f.main.get3DObject().visible).toBe(false);
    expect(f.door.get3DObject().visible).toBe(false);
});
