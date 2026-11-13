import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [output, planFile, requestedDensity] = process.argv.slice(2);
const density = Number(requestedDensity), out = path.resolve(output);
assert([2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const selection = process.argv.find(value => value.startsWith('--theater='))?.slice(10);
const edition = process.argv.find(value => value.startsWith('--edition='))?.slice(10);
const plans = JSON.parse(await fs.readFile(planFile)).plans.filter(plan =>
    (!selection || plan.theater === selection) && (!edition || plan.edition === edition));
assert(plans.length);
const report = { schema: 'native-all-map-road-slope-matrix-v1', status: 'RUNNING', density, planFile,
    scope: 'Original source placements, complete selected road closures, native HD mesh/density, frozen camera inspection and zero scene-release charges. Archive-only skirmish sources use diagnostic map selection. This does not establish public availability, campaign victory or user visual acceptance.',
    plannedMaps: plans.reduce((sum, plan) => sum + plan.maps, 0), maps: [], failures: [] };
const save = () => fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
for (const plan of plans) {
    const receipt = JSON.parse(await fs.readFile(plan.file));
    for (const mission of receipt.missions) {
        const name = `${plan.edition}-${mission.replace(/\.map$/i, '')}-${density}x`;
        const target = path.join(out, name), logFile = path.join(out, name + '.log');
        const log = await fs.open(logFile, 'wx');
        const code = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ['scripts/yr-campaign/native-authored-terrain.mjs',
                target, plan.file, String(density), mission], { cwd: process.cwd(),
                stdio: ['ignore', log.fd, log.fd], env: process.env });
            child.once('error', reject); child.once('exit', resolve);
        }).catch(error => { report.failures.push({ name, error: error.stack }); return -1; });
        await log.close();
        let native;
        try { native = JSON.parse(await fs.readFile(path.join(target, 'report.json'))); }
        catch (error) { report.failures.push({ name, error: String(error) }); }
        const row = { edition: plan.edition, theater: plan.theater, mission, density,
            report: path.join(target, 'report.json'), exitCode: code, status: native?.status,
            checkedSourceCells: native?.sourceCells?.checked, captures: native?.captures?.length,
            nativeBindings: native?.terrain?.bindings?.length, allocation: native?.terrain?.allocation,
            budget: native?.terrain?.budget, error: native?.error };
        report.maps.push(row);
        if (code !== 0 || !native?.status?.startsWith('PASS_NATIVE_ORIGINAL_TMP')) report.failures.push(row);
        await save(); console.log(JSON.stringify({ completed: report.maps.length, planned: report.plannedMaps,
            mission, density, status: row.status, failures: report.failures.length }));
    }
}
assert.equal(report.maps.length, report.plannedMaps);
report.status = report.failures.length ? 'FAIL_NATIVE_ROAD_MAP_MATRIX'
    : 'PASS_EVERY_PLANNED_ORIGINAL_MAP_SOURCE_ROAD_BINDINGS_DENSITY_FROZEN_WORLD_AND_RELEASE';
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
if (report.failures.length) process.exitCode = 1;
console.log(JSON.stringify({ status: report.status, maps: report.maps.length, failures: report.failures.length }));
