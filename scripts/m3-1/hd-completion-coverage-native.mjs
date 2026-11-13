import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const density = Number(process.argv[3]); assert([2, 4].includes(density));
const name = process.argv[4] ?? `coverage-${density}x-v1`;
const original = path.join(root, 'scripts/m3-1/hd-coverage-native.mjs');
const bytes = await fs.readFile(original), hash = createHash('sha256').update(bytes).digest('hex');
const reuse = JSON.parse(await fs.readFile(path.join(base, 'reuse-receipt.json')));
const source = JSON.parse(await fs.readFile(path.join(base, 'source/source.json')));
const contract = JSON.parse(await fs.readFile(path.join(root, 'desktop/environment-urban-hd-contract.json')));
const names = [...reuse.records.map(r => r.identity), ...source.sources.map(s => s.identity)];
assert.equal(new Set(names).size, 29);
let code = bytes.toString();
function replace(before, after) { assert(code.includes(before), before); code = code.replace(before, after); }
replace("const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);",
    `const root = ${JSON.stringify(root)}, base = path.resolve(process.argv[2]);`);
replace("path.join(root, '.artifacts/m3-1/feedback-r6/extracted.json')", "path.join(base, 'native-stage/stage.json')");
replace("path.join(base, 'inventory.json')", "path.join(root, '.artifacts/m3-1/hd-coverage-20261024/inventory.json')");
replace('options.hdDensity.value = 4;', `options.hdDensity.value = ${density};`);
replace('let app, page;', `report.scope = 'R7 signed native app, paused diagnostic reveal. Complete initial object and batch/GPU inspection; original task-force dependencies are measured before extra audit-only production prewarming. This is not a full mission or physical-input run.';
report.parentHarnessSha256 = ${JSON.stringify(hash)};
let app, page;`);
replace('    const names = await page.evaluate(rows => {', `    report.initialDemand = await page.evaluate(() => ({
        environment: structuredClone(window.__ra2debug.environmentHd), actors: structuredClone(window.__ra2debug.sovietUnitsHd)
    }));
    const names = await page.evaluate(rows => {`);
replace("['CAWA2A', 'CAWA2C', 'CAWASH19', 'CAMOV01', 'CANEWY21', 'CRUISE', 'TUG', 'CIV1', 'CIV2', 'CIV3']",
    "['CAWA2A', 'CAWA2B', 'CAWA2C', 'CAWASH19', 'BRIDGEB1', 'CAMOV01', 'CANEWY21', 'CRUISE', 'TUG', 'CIV1', 'CIV2', 'CIV3']");
const checks = `
    const required = ${JSON.stringify(names)}, familyByIdentity = ${JSON.stringify(contract.identities.ra2)};
    report.hdClosure = required.map(name => {
        const row = report.rows.find(row => row.name === name);
        assert(row, 'Missing audit identity ' + name);
        const family = report.initialDemand.environment.families[familyByIdentity[name]];
        const actor = report.initialDemand.actors.families[name];
        const readyBeforeManualWarm = family?.density === ${density} || actor?.density === ${density} && actor.status === 'READY';
        const instances = row.instances.map(instance => ({ id: instance.id,
            bound: instance.vxlBound || instance.batch?.gpuHd || instance.parts.some(part => part.gpuHd) }));
        assert(readyBeforeManualWarm, 'Initial demand did not publish ' + name + ': ' + JSON.stringify({family, actor}));
        assert(instances.every(instance => instance.bound), 'Native instance lacks HD material: ' + name);
        return { name, readyBeforeManualWarm, instances, familyDensity: family?.density, actorDensity: actor?.density,
            futureOnly: !instances.length, preparedOverride: row.preparedOverride };
    });
    assert(report.openingAircraft?.vxlBound, 'Genuine opening aircraft lacks its new family');
    assert.equal(report.openingAircraft.familyReport.density, ${density});
    assert(report.world.actors.gpuBytes <= report.world.actors.budget);
    const worldBudget = ${density === 4 ? 1280 : 512} * 1024 * 1024;
    assert(report.world.terrain.worldChargeBytes + report.world.environment.worldChargeBytes <= worldBudget);
    report.fixedWorldBudget = worldBudget;
`;
replace("    report.status = 'PASS_NATIVE_DIAGNOSTIC_HD_COVERAGE_INSPECTION_WITH_EXPLICIT_GAPS';",
    checks + "    report.status = 'PASS_NATIVE_GPU_HD_CLOSURE_ALL_29_AUDITED_GAP_IDENTITIES';");
const generated = path.join(base, `coverage-observer-${density}x-${name}.mjs`);
await fs.writeFile(generated, code, { flag: 'wx' });
const child = spawn(process.execPath, [generated, base, name], { cwd: root, env: process.env, stdio: 'inherit' });
process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
