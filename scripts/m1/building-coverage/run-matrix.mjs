import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const cases = [
    ['ra2-temperate', 'ra2', 'MP01T4.map'], ['ra2-urban', 'ra2', 'MP33U4.map'],
    ['ra2-snow', 'ra2', 'MP12S4.map'], ['yr-temperate', 'yr', 'XMP01T4.map'],
    ['yr-urban', 'yr', 'XMP33U4.map'], ['yr-snow', 'yr', 'XMP12S4.map'],
    ['yr-newurban', 'yr', 'Manhatta.map'], ['yr-desert', 'yr', 'DryHeat.map'],
];
const results = [];
for (const [name, edition, map] of cases) {
    console.log('RUN', name);
    const log = await fs.open(path.join(out, name + '.log'), 'wx');
    const args = ['scripts/editions/validate-bootstrap.mjs', build, path.join(out, name), edition,
        '--country=5', `--map=${map}`, '--soviet-building-hd'];
    if (name === 'yr-temperate') args.push('--lunar-probe', '--building-functions');
    const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { stdio: ['ignore', log.fd, log.fd] });
        child.on('error', reject); child.on('close', resolve);
    });
    await log.close();
    let report;
    try { report = JSON.parse(await fs.readFile(path.join(out, name, 'result.json'), 'utf8')); } catch {}
    results.push({ name, code, status: report?.status, coverage: report?.buildingCoverage,
        functions: report?.newBuildingFunctions, failure: report?.failure });
    await fs.writeFile(path.join(out, 'matrix.json'), JSON.stringify({ build, results }, null, 2));
    console.log(name, code, report?.status);
    // Continue independent families/theaters and retain named failures.
}
if (results.some(r => r.code)) process.exitCode = 1;
