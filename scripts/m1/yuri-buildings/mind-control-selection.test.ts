import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { MindControlLinkPlugin } from '../../../src/engine/renderable/entity/plugin/MindControlLinkPlugin';

test('selected controlled targets expose only their link, without duplicate effects or hostile intel', () => {
    const first = { position: { worldPosition: new THREE.Vector3(2, 0, 1) } };
    const second = { position: { worldPosition: new THREE.Vector3(3, 0, 2) } };
    let targets = [first, second], sourceSelected = false, shared = true;
    const selected = new Set<any>(), effects = new Set<any>();
    const source = { isDestroyed: false, owner: { color: { asHex: () => 0x8822dd } },
        position: { worldPosition: new THREE.Vector3() }, mindControllerTrait: { getTargets: () => targets } };
    const plugin = new MindControlLinkPlugin(source, { isSelected: () => sourceSelected },
        { haveSharedIntel: () => shared }, { value: {} }, { isSelected: target => selected.has(target) });
    plugin.onCreate({ addEffect: (effect: any) => {
        effects.add(effect); effect.removeAndDispose = () => effects.delete(effect);
    } });
    plugin.update(); expect(effects.size).toBe(0);
    selected.add(first); plugin.update(); expect(effects.size).toBe(1);
    const original = [...effects][0]; plugin.update(); expect([...effects]).toEqual([original]);
    sourceSelected = true; plugin.update(); expect(effects.size).toBe(2);
    sourceSelected = false; plugin.update(); expect([...effects]).toEqual([original]);
    targets = [second]; plugin.update(); expect(effects.size).toBe(0);
    selected.add(second); plugin.update(); expect(effects.size).toBe(1);
    shared = false; plugin.update(); expect(effects.size).toBe(0);
    shared = true; plugin.update(); expect(effects.size).toBe(1);
    source.isDestroyed = true; plugin.update(); expect(effects.size).toBe(0);
    plugin.dispose();
});
