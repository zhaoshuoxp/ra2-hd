// Isolated CPU diagnostics; no renderer, game, local profile or retail payload loaded.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as THREE from 'three';
import { createSpriteGeometry } from '../../src/engine/gfx/SpriteUtils.ts';
import { Coords } from '../../src/game/Coords.ts';
import { LocalVariableExecutor } from '../../src/game/trigger/executor/LocalVariableExecutor.ts';
import { LocalVariableCondition } from '../../src/game/trigger/condition/LocalVariableCondition.ts';
import { GlobalVariableExecutor } from '../../src/game/trigger/executor/GlobalVariableExecutor.ts';
import { DestroyedAllUnitsCondition } from '../../src/game/trigger/condition/DestroyedAllUnitsCondition.ts';
import { DestroyedAllBuildingsCondition } from '../../src/game/trigger/condition/DestroyedAllBuildingsCondition.ts';
import { BuildObjectTypeCondition } from '../../src/game/trigger/condition/BuildObjectTypeCondition.ts';
import { ElapsedTimeCondition } from '../../src/game/trigger/condition/ElapsedTimeCondition.ts';
import { ToggleTriggerExecutor } from '../../src/game/trigger/executor/ToggleTriggerExecutor.ts';
import { TextTriggerExecutor } from '../../src/game/trigger/executor/TextTriggerExecutor.ts';
import { TriggerManager } from '../../src/game/trigger/TriggerManager.ts';

const out = '.artifacts/m0-4';
mkdirSync(out, { recursive: true });
const contract = JSON.parse(readFileSync('docs/hd-atlas-contract.example.json', 'utf8'));
assert.equal(contract.status, 'draft-not-implemented');
assert.equal(contract.schemaVersion, 2);
const camera = new THREE.OrthographicCamera(-512, 512, 384, -384, 0, 16000);
camera.rotation.order = 'YXZ';
camera.rotation.x = -Coords.ISO_CAMERA_ALPHA;
camera.rotation.y = Coords.ISO_CAMERA_BETA;
const frame = contract.logical.frames[0];
const width = frame.legacyRenderSize[0], height = frame.legacyRenderSize[1];
const offset = { x: frame.trimOrigin[0] - contract.logical.anchor[0], y: frame.trimOrigin[1] - contract.logical.anchor[1] };
function geometry(w, h) {
    return createSpriteGeometry({ camera, texture: { image: { width: w, height: h } },
        textureArea: { x: 0, y: 0, width: w, height: h }, offset,
        scale: Coords.ISO_WORLD_SCALE, depth: true, depthOffset: 3, align: { x: 1, y: -1 } });
}
const baseline = geometry(width, height);
const positions = [...baseline.getAttribute('position').array];
const results = [];
for (const variant of contract.variants) {
    const density = variant.density;
    const page = variant.pages[0], rect = variant.frames[0].sampleRect;
    assert.equal(rect[2], width * density);
    assert.equal(rect[3], height * density);
    assert(rect[0] >= 2 && rect[1] >= 2 && rect[0] + rect[2] + 2 <= page.size[0] && rect[1] + rect[3] + 2 <= page.size[1]);
    // Normative calculation: unchanged logical vertices, UV split scaled to atlas pixels.
    const logical = geometry(width, height);
    const uv = logical.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
        const u = (rect[0] + uv.getX(i) * rect[2]) / page.size[0];
        const v = 1 - (rect[1] + (1 - uv.getY(i)) * rect[3]) / page.size[1];
        assert(u >= 0 && u <= 1 && v >= 0 && v <= 1);
        uv.setXY(i, u, v);
    }
    assert.deepEqual([...logical.getAttribute('position').array], positions);
    const naive = geometry(rect[2], rect[3]);
    const naiveUnchanged = JSON.stringify([...naive.getAttribute('position').array]) === JSON.stringify(positions);
    assert.equal(naiveUnchanged, density === 1);
    results.push({ density, logicalVerticesEqual: true, naivePixelSizedGeometryEqual: naiveUnchanged,
        logicalSplitX: -offset.x >= 0 && -offset.x <= width ? -offset.x : width / 2, atlasRect: rect,
        pageBytesRgbaAndMetadata: page.size[0] * page.size[1] * 8 });
    logical.dispose(); naive.dispose();
}
baseline.dispose();
const action = (id, value) => ({ type: id, params: [0, String(value), '0', '0', '0', '0', 0], triggerId: 'synthetic', index: 0 });
const event = (id, value) => ({ type: id, params: [0, String(value)], triggerId: 'synthetic', eventIndex: 0 });
const trigger = { id: 'synthetic', houseName: 'SyntheticHouse', name: 'Synthetic' };
const manager = new TriggerManager();
const context = { triggers: manager };
new LocalVariableExecutor(action(56, 3), trigger, true).execute(context);
assert.equal(new LocalVariableCondition(event(36, 3), trigger, true).check(context), true);
let globalId;
new GlobalVariableExecutor(action(28, 3), trigger, true).execute({ triggers: { toggleGlobalVariable(id) { globalId = id; } } });
assert(Number.isNaN(globalId));
const units = new DestroyedAllUnitsCondition(event(9, 13), trigger);
let unitError;
try { units.check(context, []); } catch (error) { unitError = error.message; }
assert(unitError?.includes('some'));
const buildings = new DestroyedAllBuildingsCondition(event(10, 13), trigger);
const build = new BuildObjectTypeCondition(event(21, 3), trigger, 0);
assert(Number.isNaN(buildings.houseId));
assert(Number.isNaN(build.objectIndex));
let toggle, textEvent;
new ToggleTriggerExecutor(action(53, 'synthetic-target'), trigger, true).execute({ triggers: { setTriggerEnabled(id, value) { toggle = [id, value]; } } });
assert.deepEqual(toggle, ['synthetic-target', true]);
new TextTriggerExecutor(action(11, 'SYNTHETIC:TEXT'), trigger).execute({ events: { dispatch(value) { textEvent = value; } } });
assert(textEvent);
const elapsed = new ElapsedTimeCondition(event(13, 0), trigger);
const boundary = [elapsed.check(context), elapsed.check(context)];
assert.deepEqual(boundary, [false, true]);
const report = { scope: 'CPU-only; normative UV calculation, direct handlers; no GPU or mission acceptance',
    contract: { schemaVersion: contract.schemaVersion, geometry: results },
    handlers: { localSetThenRead: 'PASS', enableTriggerForwarding: 'PASS', textEventDispatch: 'PASS',
        globalSetParameterIndex: 'REPRODUCED NaN with factory-shaped action',
        destroyedAllUnitsCheck: unitError, destroyedAllBuildingsHouseId: 'REPRODUCED NaN',
        buildObjectTypeIndex: 'REPRODUCED NaN', elapsedZeroSecondsFirstTwoChecks: boundary },
    display: { observation: 'NOT RUN', cssCanvasSize: null, drawingBufferSize: null, devicePixelRatio: null,
        rendererPixelRatio: null, gameViewport: null, cameraBounds: null,
        staticExpectedPixelRatio: 1, limitation: 'Source inference only; no Retina or device GPU limit claim' } };
writeFileSync(`${out}/probes.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
