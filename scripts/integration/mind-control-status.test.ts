import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { MindControlStatusPlugin } from '../../src/engine/renderable/entity/plugin/MindControlStatusPlugin';
import { Color } from '../../src/util/Color';
import { Palette } from '../../src/data/Palette';
import { IniFile } from '../../src/data/IniFile';
import { Art } from '../../src/game/art/Art';
import { ObjectType } from '../../src/engine/type/ObjectType';

test('global status members absent from the animation list retain native art timing', () => {
    const ini = new IniFile('[General]\nControlledAnimationType=MINDANIM\nPermaControlledAnimationType=MINDANIMR');
    const artIni = new IniFile('[MINDANIM]\nLoopCount=-1\nRate=300\n[MINDANIMR]\nLoopCount=-1\nRate=300');
    const names = new Set(['MINDANIM']);
    const art = new Art({ getIni: () => ini, allObjectRules: new Map(), animationNames: names }, artIni, undefined, undefined);
    expect(art.hasObject('MINDANIMR', ObjectType.Animation)).toBe(true);
    expect(art.getAnimation('MINDANIMR').art.getNumber('LoopCount')).toBe(-1);
    expect(art.getAnimation('MINDANIMR').art.getNumber('Rate')).toBe(300);
    expect(names.has('MINDANIMR')).toBe(false);
});

function fixture() {
    let active = true, controller: any = {}, hostile = false;
    const unit: any = { isSpawned: true, owner: { color: Color.fromRgb(255, 24, 24) },
        position: { worldPosition: new THREE.Vector3(3, 0, 4) },
        mindControllableTrait: { isActive: () => active, getController: () => controller },
        cloakableTrait: { isCloaked: () => hostile } };
    const live = new Set<any>(), history: any[] = [];
    const manager = { getRenderableByGameObject: () => undefined,
        getRenderableContainer: () => ({ updateChild: () => {} }),
        createTransientAnim: (name: string, callback: any) => {
            const anim: any = { name, disposed: 0, position: new THREE.Vector3(),
                palette: new Palette(new Uint8Array(768).fill(63)),
                create3DObject: () => {}, setPosition: (p: any) => anim.position.copy(p),
                remove: () => live.delete(anim), dispose: () => anim.disposed++ };
            callback(anim); live.add(anim); history.push(anim); return anim;
        } };
    const plugin = new MindControlStatusPlugin(unit, 'MINDANIM', 'MINDANIMR',
        new THREE.Camera(), { value: {} }, { haveSharedIntel: () => !hostile });
    plugin.onCreate(manager);
    return { unit, live, history, plugin, release: () => { active = false; },
        permanent: () => { controller = undefined; }, hide: () => { hostile = true; } };
}

test('unselected controlled victims retain one following marker and release it once', () => {
    const f = fixture(); f.plugin.update();
    const first = f.history[0];
    expect(first.name).toBe('MINDANIM'); expect(first.palette.colors[185].r).toBe(252);
    expect(first.palette.colors[185].g).toBe(252);
    for (let i = 0; i < 120; i++) {
        f.unit.position.worldPosition.x++; f.plugin.update();
    }
    expect(f.live.size).toBe(1); expect(f.history.length).toBe(1);
    expect(first.position.x).toBe(f.unit.position.worldPosition.x);
    f.release(); f.plugin.update(); f.plugin.onRemove(); f.plugin.dispose();
    expect(f.live.size).toBe(0); expect(first.disposed).toBe(1);
});

test('owner changes retain native palette and marker; permanent control, cloak and removal follow lifetime', () => {
    const f = fixture(); f.plugin.update();
    f.unit.owner = { color: Color.fromRgb(34, 187, 51) }; f.plugin.update();
    expect(f.history[0].disposed).toBe(0); expect(f.live.size).toBe(1);
    expect(f.history.length).toBe(1); expect(f.history[0].palette.colors[185].g).toBe(252);
    f.permanent(); f.plugin.update();
    expect(f.history[0].disposed).toBe(1); expect(f.history[1].name).toBe('MINDANIMR');
    f.hide(); f.plugin.update(); expect(f.live.size).toBe(0);
    expect(f.history[1].disposed).toBe(1);
    f.plugin.onRemove(); f.plugin.update(); expect(f.live.size).toBe(0);
});
