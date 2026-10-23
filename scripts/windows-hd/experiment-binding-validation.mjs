import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

// A synthetic CPU control, never installed in Three.js or the application.
const output = process.argv[2];
assert(output, 'Provide a new report filename');
const source = await fs.readFile('node_modules/three/build/three.module.js', 'utf8');
const version = JSON.parse(await fs.readFile('node_modules/three/package.json', 'utf8')).version;
assert.equal(version, '0.183.2');
const start = source.indexOf('\tfunction needsUpdate( object, geometry, program, index ) {');
const end = source.indexOf('\tfunction initAttributes()', start);
assert(start >= 0 && end > start);
const functions = source.slice(start, end);
assert.equal(functions.match(/function needsUpdate\(/g)?.length, 1);
assert.equal(functions.match(/function saveCache\(/g)?.length, 1);
const factory = new Function('currentState', `${functions}
    return { baseline: needsUpdate, save: saveCache };`);

function cachedRecords(state, object, geometry, index) {
    const records = state.attributeRecords;
    if (records === undefined) return true;
    const attributes = geometry.attributes;
    for (let i = 0; i < records.length; i++) {
        const cached = records[i];
        let attribute = attributes[cached.name];
        if (attribute === undefined) {
            if (cached.name === 'instanceMatrix' && object.instanceMatrix) attribute = object.instanceMatrix;
            if (cached.name === 'instanceColor' && object.instanceColor) attribute = object.instanceColor;
        }
        if (cached.attribute !== attribute) return true;
        if (attribute && cached.data !== attribute.data) return true;
    }
    return state.attributesNum !== records.length || state.index !== index;
}

function fixture(count, instanced = false) {
    const names = Array.from({ length: count }, (_, i) => `attribute${i}`);
    if (instanced) names.splice(names.length - 2, 2, 'instanceMatrix', 'instanceColor');
    const programAttributes = Object.fromEntries(names.map((name, i) => [name, { location: i }]));
    programAttributes.inactive = { location: -1 };
    const attributes = Object.fromEntries(names.map((name, i) => [name, i % 3 === 0 ? { data: {} } : {}]));
    const object = instanced ? { instanceMatrix: attributes.instanceMatrix, instanceColor: attributes.instanceColor } : {};
    if (instanced) { delete attributes.instanceMatrix; delete attributes.instanceColor; }
    const geometry = { attributes }, program = { getAttributes: () => programAttributes }, index = {};
    const state = { attributes: {}, index: null }, control = factory(state);
    const save = () => {
        control.save(object, geometry, program, index);
        state.attributeRecords = Object.entries(state.attributes).map(([name, cached]) => ({ name, ...cached }));
    };
    const baseline = () => control.baseline(object, geometry, program, index);
    const experimental = () => cachedRecords(state, object, geometry, index);
    return { object, geometry, program, index, state, save, baseline, experimental };
}

const checks = [];
function check(label, mutate, expected, instanced = false) {
    const f = fixture(8, instanced);
    if (label !== 'uncached-state') f.save();
    mutate(f);
    const baseline = f.baseline(), experimental = f.experimental();
    assert.equal(baseline, expected, label);
    assert.equal(experimental, baseline, label);
    checks.push({ label, expected, baseline, experimental });
}
check('uncached-state', () => {}, true);
check('unchanged', () => {}, false);
check('attribute-replaced', f => { f.geometry.attributes.attribute1 = {}; }, true);
check('attribute-removed', f => { delete f.geometry.attributes.attribute1; }, true);
check('interleaved-buffer-replaced', f => { f.geometry.attributes.attribute0.data = {}; }, true);
check('interleaved-buffer-removed', f => { delete f.geometry.attributes.attribute0.data; }, true);
check('index-replaced', f => { f.state.index = {}; }, true);
check('cache-count-changed', f => { f.state.attributesNum--; }, true);
check('instanced-unchanged', () => {}, false, true);
check('instance-matrix-replaced', f => { f.object.instanceMatrix = {}; }, true, true);
check('instance-color-removed', f => { delete f.object.instanceColor; }, true, true);
check('geometry-overrides-instance-matrix', f => { f.geometry.attributes.instanceMatrix = {}; }, true, true);
check('inactive-attribute-replaced', f => { f.geometry.attributes.inactive = {}; }, false);
check('attribute-content-version-changed', f => { f.geometry.attributes.attribute1.version = 1; }, false);

const measurements = [];
for (const [count, instanced] of [[3, false], [8, false], [16, true]]) {
    const f = fixture(count, instanced); f.save();
    const time = (fn, iterations) => {
        let changed = 0;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) changed += Number(fn());
        const ms = performance.now() - start;
        assert.equal(changed, 0);
        return ms;
    };
    time(f.baseline, 20000); time(f.experimental, 20000);
    const calibration = time(f.baseline, 200000);
    const iterations = Math.min(4000000, Math.max(200000, Math.round(30000000 / Math.max(calibration, 1))));
    const rows = [];
    for (const which of ['baseline', 'experimental', 'experimental', 'baseline',
        'experimental', 'baseline', 'baseline', 'experimental']) {
        rows.push({ which, iterations, ms: time(f[which], iterations) });
    }
    const mean = which => rows.filter(row => row.which === which).reduce((sum, row) => sum + row.ms, 0) / 4;
    measurements.push({ count, instanced, rows, baselineMs: mean('baseline'), experimentalMs: mean('experimental'),
        reductionPercent: 100 * (1 - mean('experimental') / mean('baseline')) });
}
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(output, JSON.stringify({ schemaVersion: 1,
    status: 'PASS_SYNTHETIC_BINDING_VALIDATION_EXPERIMENT_NOT_AN_APPLICATION_REPAIR',
    platform: process.platform, runtime: process.versions, threeVersion: version,
    source: 'node_modules/three/build/three.module.js',
    sourceSha256: createHash('sha256').update(source).digest('hex'), checks, measurements,
    boundaries: [
        'Synthetic cache states and attributes; no WebGL calls, real draw list, pixel comparison or game FPS measurement.',
        'Compiled program attribute layouts are immutable in installed WebGLProgram; new programs need independent binding states.',
        'Buffer data uploads, VAO setup/reset/disposal and integration correctness are not tested by this control.',
        'Cached records are exploratory only. No application, dependency, source bundle or shipped kit was modified.',
        'Mac CPU results cannot establish Windows gain. The sampled hot function is only part of remaining frame work.'
    ] }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ checks: checks.length, measurements: measurements.map(({ count, reductionPercent }) =>
    ({ count, reductionPercent })), output }));
