import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const [buildArg, appArg, outputArg] = process.argv.slice(2);
const build = path.resolve(buildArg), app = path.resolve(appArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const reuseFiles = process.argv.filter(a => a.startsWith('--reuse=')).map(a => path.resolve(a.slice(8)));
const reused = new Map();
for (const file of reuseFiles) {
    const previous = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(previous.app, app); assert.equal(previous.build, build);
    for (const row of previous.cases) if (row.status === 'PASS_NATIVE_SELECTED_CASES') reused.set(row.name, row);
}
const report = { category: 'PACKAGED_MAC_NATIVE_SCRIPTED_MATRIX', app, build, cases: [], status: 'RUNNING' };
try {
    for (const snow of [false, true]) for (const [edition, faction, country] of [
        ['ra2', 'allied', 0], ['ra2', 'soviet', 5], ['yr', 'allied', 0], ['yr', 'soviet', 5], ['yr', 'yuri', 9],
    ]) {
        const name = `${edition}-${faction}-${snow ? 'snow' : 'temperate'}`, directory = path.join(output, name);
        const map = `${edition === 'yr' ? 'X' : ''}${snow ? 'MP12S4' : 'MP23T4'}.map`;
        const prior = reused.get(name);
        if (prior) {
            const result = JSON.parse(await fs.readFile(path.join(prior.directory, 'result.json'), 'utf8'));
            assert.equal(result.status, 'PASS_NATIVE_SELECTED_CASES'); assert.equal(prior.map, map);
            assert.equal(prior.country, country); assert.equal(result.trainer.smoke, snow);
            await fs.symlink(prior.directory, directory, 'dir');
            report.cases.push({ ...prior, directory, reusedFrom: prior.directory });
            console.log(`REUSED PASS ${name}`); continue;
        }
        const args = ['scripts/editions/validate-bootstrap.mjs', build, directory, edition,
            `--app=${app}`, `--country=${country}`, `--map=${map}`, '--trainer', ...(snow ? ['--trainer-smoke'] : [])];
        if (name === 'ra2-allied-temperate') args.push('--trainer-lifecycle');
        const log = await fs.open(path.join(output, `${name}.log`), 'wx');
        const code = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, args, { stdio: ['ignore', log.fd, log.fd] });
            child.on('error', reject); child.on('close', resolve);
        });
        await log.close();
        const result = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));
        report.cases.push({ name, edition, faction, country, map, snow, scope: snow ? 'UI_SELECTION_EFFECT_SMOKE' : 'FULL_FEATURE_QUEUE_OWNERSHIP_POWERS_INPUT', directory, status: result.status });
        await fs.writeFile(path.join(output, 'matrix.json'), JSON.stringify(report, null, 2));
        assert.equal(code, 0, name); assert.equal(result.status, 'PASS_NATIVE_SELECTED_CASES', name);
        console.log(`PASS ${name}`);
    }
    report.status = 'PASS_10_CASES';
} catch (e) { report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1; }
await fs.writeFile(path.join(output, 'matrix.json'), JSON.stringify(report, null, 2));
console.log(report.status);
