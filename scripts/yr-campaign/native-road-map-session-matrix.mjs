import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession } from '../m3-2/native-session.mjs';

const [output, planFile, requestedDensity] = process.argv.slice(2);
const authoredTerrain = process.argv.includes('--authored-terrain');
const density = Number(requestedDensity), out = path.resolve(output), originalArgv = [...process.argv];
assert([2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const theaters = process.argv.find(value => value.startsWith('--theater='))?.slice(10).split(',');
const edition = process.argv.find(value => value.startsWith('--edition='))?.slice(10);
const limit = Number(process.argv.find(value => value.startsWith('--limit='))?.slice(8) ?? Infinity);
const offset = Number(process.argv.find(value => value.startsWith('--offset='))?.slice(9) ?? 0);
assert(Number.isSafeInteger(offset) && offset >= 0);
const priorFile = process.argv.find(value => value.startsWith('--reuse-from='))?.slice(13);
assert(!authoredTerrain || !priorFile, 'Authored-terrain qualification requires fresh source-map cases');
const prior = priorFile && JSON.parse(await fs.readFile(priorFile));
const plans = JSON.parse(await fs.readFile(planFile)).plans.filter(plan =>
    (!theaters || theaters.includes(plan.theater)) && (!edition || plan.edition === edition));
const cases = [];
for (const plan of plans) {
    const receipt = JSON.parse(await fs.readFile(plan.file));
    for (const mission of receipt.missions) cases.push({ plan, receipt, mission });
}
cases.splice(0, offset); cases.splice(limit); assert(cases.length);
const report = { schema: authoredTerrain ? 'native-authored-terrain-map-matrix-v1'
        : 'native-all-map-road-slope-matrix-v2', status: 'RUNNING', density, planFile,
    reusedProcessBetweenMaps: true, priorMatrix: priorFile,
    scope: authoredTerrain
        ? 'Original source identities, selected authored groups, independent density bindings, frozen worlds and zero-charge scene release are checked for every declared source map. The isolated process is reused only after release. Native image review and public campaign acceptance remain separate.'
        : 'Every original source road placement and selected map closure is checked independently. The isolated native process is reused after verified zero-charge scene release. Previously passing cases require identical pinned atlas hashes. Archive-only maps use diagnostic selection; public campaign acceptance and user visual approval remain separate.',
    plannedMaps: cases.length, filter: { theaters, edition, offset, limit: Number.isFinite(limit) ? limit : undefined },
    maps: [], failures: [], sessionControls: [], invalidatedPriorCases: [] };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = () => fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
let session, sessionEdition, sessions = 0;
try {
    for (const [index, { plan, receipt, mission }] of cases.entries()) {
        let earlier = prior?.maps.find(row => row.edition === plan.edition && row.mission === mission
            && row.density === density && row.status?.startsWith('PASS_NATIVE_ORIGINAL_TMP'));
        if (earlier) {
            const raw = await fs.readFile(earlier.report), native = JSON.parse(raw);
            if (earlier.reportSha256) assert.equal(sha(raw), earlier.reportSha256, 'Prior native evidence changed');
            assert.equal(native.density, density); assert.equal(native.edition, plan.edition);
            assert.equal(native.sourceCells.checked, receipt.mapClosures[mission].sourceCells.length);
            const previousReceipt = JSON.parse(await fs.readFile(native.receipt));
            assert.deepEqual(previousReceipt.mapClosures[mission].sourceCells, receipt.mapClosures[mission].sourceCells);
            assert.equal(previousReceipt.mapClosures[mission].sourceSha256, receipt.mapClosures[mission].sourceSha256);
            const exactArt = native.terrain.groups.length === receipt.mapClosures[mission].groups.length
                && native.terrain.bindings.length === receipt.mapClosures[mission].subtiles
                && native.terrain.groups.every(group => group.sha256 === receipt.variants[group.id]?.[density]);
            if (exactArt) report.maps.push({ ...earlier, reusedPassingCase: true, reportSha256: sha(raw) });
            else {
                report.invalidatedPriorCases.push({ edition: plan.edition, mission, density,
                    report: earlier.report, reason: 'SELECTED_ATLAS_CHANGED_REQUIRES_FRESH_NATIVE_CASE' });
                earlier = undefined;
            }
        }
        if (!earlier) {
            if (!session || sessionEdition !== plan.edition) {
                await session?.app.close();
                const directory = path.join(out, 'session-' + plan.edition + '-' + (++sessions));
                await fs.mkdir(directory);
                const control = { errors: [], failedResources: [] };
                session = await campaignSession(directory, control, { edition: plan.edition, density });
                report.sessionControls.push({ directory, edition: plan.edition, control });
                sessionEdition = plan.edition;
            }
            globalThis.__nativeTerrainMatrixSession = session;
            const name = `${plan.edition}-${mission.replace(/\.map$/i, '')}-${density}x`, target = path.join(out, name);
            process.argv = [process.execPath, path.resolve('scripts/yr-campaign/native-authored-terrain.mjs'),
                target, plan.file, String(density), mission];
            let native, raw;
            try {
                await import('./native-authored-terrain.mjs?matrix=' + encodeURIComponent(out) + '&case=' + index);
                raw = await fs.readFile(path.join(target, 'report.json')); native = JSON.parse(raw);
            } catch (error) { report.failures.push({ name, error: error.stack }); }
            finally { process.argv = [...originalArgv]; }
            const row = { edition: plan.edition, theater: plan.theater, mission, density,
                report: path.join(target, 'report.json'), reportSha256: raw && sha(raw), status: native?.status,
                checkedSourceCells: native?.sourceCells?.checked, captures: native?.captures?.length,
                nativeBindings: native?.terrain?.bindings?.length, allocation: native?.terrain?.allocation,
                budget: native?.terrain?.budget, error: native?.error };
            report.maps.push(row);
            if (!native?.status?.startsWith('PASS_NATIVE_ORIGINAL_TMP')) {
                report.failures.push(row); await session.app.close(); session = undefined;
            }
        }
        await save(); console.log(JSON.stringify({ completed: report.maps.length, planned: cases.length,
            mission, density, status: report.maps.at(-1).status, failures: report.failures.length }));
    }
} finally {
    delete globalThis.__nativeTerrainMatrixSession; process.argv = originalArgv; await session?.app.close();
}
for (const session of report.sessionControls) {
    const control = session.control;
    if (control.errors.length || control.failedResources.length || control.consoleErrors?.length)
        report.failures.push({ phase: 'session-control', directory: session.directory,
            errors: control.errors, failedResources: control.failedResources, consoleErrors: control.consoleErrors });
}
report.status = authoredTerrain
    ? report.failures.length ? 'FAIL_NATIVE_AUTHORED_TERRAIN_MAP_MATRIX'
        : 'PASS_EVERY_PLANNED_SOURCE_MAP_AUTHORED_TERRAIN_DENSITY_FROZEN_WORLD_AND_RELEASE'
    : report.failures.length ? 'FAIL_NATIVE_ROAD_MAP_MATRIX'
        : 'PASS_EVERY_PLANNED_ORIGINAL_MAP_SOURCE_ROAD_BINDINGS_DENSITY_FROZEN_WORLD_AND_RELEASE';
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
process.exitCode = report.failures.length ? 1 : 0;
console.log(JSON.stringify({ status: report.status, maps: report.maps.length, failures: report.failures.length, sessions }));
