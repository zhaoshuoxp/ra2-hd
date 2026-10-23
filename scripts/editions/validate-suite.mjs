import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const [buildArg, outArg, mode = 'mechanics'] = process.argv.slice(2);
const build = path.resolve(buildArg), out = path.resolve(outArg);
await fs.mkdir(out, { recursive: false });
const cases = mode === 'countries'
    ? ['ra2', 'yr'].flatMap(edition => Array.from({ length: edition === 'ra2' ? 9 : 10 }, (_, i) => [`${edition}-${i}`, edition, `--country=${i}`]))
    : [
        ['economy', 'yr', '--economy'], ['powers', 'yr', '--powers'],
        ['cloning', 'yr', '--mechanics', '--cloning'], ['virus', 'yr', '--mechanics', '--virus'],
        ['core', 'yr', '--mechanics', '--traits', '--support', '--buildings', '--naval', '--air'],
        ['fortress', 'yr', '--mechanics', '--fortress'], ['passengers', 'yr', '--mechanics', '--passengers'],
        ['garrison', 'yr', '--mechanics', '--garrison'], ['miner-production', 'yr', '--miner-production'],
        ['loading-ai', 'yr', '--country=0', '--enemy-country=9', '--autoplay', '--loading-ai'],
        ['tech-ra2', 'ra2', '--tech-catalog'], ['tech-yr', 'yr', '--tech-catalog'],
        ['ai-powers', 'yr', '--ai-powers'], ['naval-ai', 'yr', '--naval-ai'],
        ['transitions', 'yr', '--mechanics', '--traits', '--transitions'],
        ['tech-buildings', 'yr', '--mechanics', '--tech-buildings'],
        ['bridges', 'yr', '--map=BridgeGap.map', '--mechanics', '--bridges'],
        ['tower', 'yr', '--mechanics', '--tower'],
    ];
const results = [];
const selectedNames = process.argv.slice(5);
for (const [name, edition, ...flags] of cases.filter(([name]) => !selectedNames.length || selectedNames.includes(name))) {
    console.log('RUN', name);
    const target = path.join(out, name);
    const log = await fs.open(path.join(out, `${name}.log`), 'w');
    const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/editions/validate-bootstrap.mjs', build, target, edition, ...flags], { stdio: ['ignore', log.fd, log.fd] });
        child.on('error', reject); child.on('close', resolve);
    });
    await log.close();
    const result = JSON.parse(await fs.readFile(path.join(target, 'result.json'), 'utf8'));
    results.push({ name, status: result.status, code });
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ mode, build, results }, null, 2));
    console.log(name, result.status);
    if (code) { process.exitCode = 1; break; }
}
