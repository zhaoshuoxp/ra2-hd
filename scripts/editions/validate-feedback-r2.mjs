import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const cases = [
    ['easy-yr', 'yr', '--country=0', '--enemy-country=9', '--enemy-difficulty=2', '--pacing'],
    ['normal-yr', 'yr', '--country=0', '--enemy-country=9', '--enemy-difficulty=4', '--autoplay', '--pacing', '--battle'],
    ['brutal-yr', 'yr', '--country=0', '--enemy-country=9', '--enemy-difficulty=0', '--pacing'],
    ['ra2', 'ra2', '--country=5', '--presentation'],
    ['desert', 'yr', '--country=5', '--map=SaharaMi.map', '--two-player', '--presentation'],
    ['urban', 'yr', '--country=5', '--map=XMP33U4.map', '--presentation'],
];
const results = [];
const selected = process.argv.slice(4);
for (const [name, edition, ...flags] of cases.filter(([name]) => !selected.length || selected.includes(name))) {
    console.log('RUN', name);
    const file = await fs.open(path.join(out, `${name}.log`), 'w');
    const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/editions/validate-bootstrap.mjs', build, path.join(out, name), edition, ...flags],
            { stdio: ['ignore', file.fd, file.fd], env: { ...process.env, RA2_BATTLE_TIMEOUT_MS: '900000' } });
        child.on('error', reject); child.on('close', resolve);
    });
    await file.close();
    const report = JSON.parse(await fs.readFile(path.join(out, name, 'result.json'), 'utf8'));
    results.push({ name, status: report.status, code });
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ build, results }, null, 2));
    console.log(name, report.status);
    if (code) { process.exitCode = 1; break; }
}
