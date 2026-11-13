import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const at = value.indexOf('='); return [value.slice(2, at), value.slice(at + 1)];
}));
if ((!args.app && args.development !== '1') || !args.out)
    throw Error('Use: node native-regressions.mjs --app=/absolute/app (or --development=1) --out=/new/output');
const app = args.app && path.resolve(args.app), output = path.resolve(args.out), root = path.resolve(import.meta.dirname, '../..');
fs.mkdirSync(output, { recursive: false });
const cases = [
    { name: 'edition-menu', script: 'scripts/ui/native-edition-menu-title.mjs', options: [] },
    { name: 'ra2-media-save-restart', script: 'scripts/hd-movies/native-playback.mjs', options: ['--hd', '--ra2', '--density=4'] },
    { name: 'yr-media-save-restart', script: 'scripts/hd-movies/native-playback.mjs', options: ['--hd', '--density=4'] },
    { name: 'ra2-victory-next', script: 'scripts/campaign-completion/native-ending-flow-v53.mjs', options: ['--hd', '--density=4'] },
];
if (args['yr-checkpoint']) cases.push({ name: 'yr-victory-next', script: 'scripts/yr-campaign/native-soviet06-ending-feedback.mjs',
    options: ['--public-next', '--density=4', '--checkpoint=' + path.resolve(args['yr-checkpoint'])] });
const report = { schema: 'm4-native-regression-suite-v1', app, development: !app,
    vehicleShadows: args['vehicle-shadows'] ?? 'default', status: 'RUNNING', cases: [] };
for (const row of cases) {
    console.log(JSON.stringify({ stage: 'start', case: row.name }));
    const out = path.join(output, row.name), log = fs.openSync(out + '.log', 'wx');
    const options = [...row.options, ...(app ? ['--app=' + app] : []),
        ...(args['vehicle-shadows'] === 'on' ? ['--vehicle-shadow-instancing'] : [])];
    const result = spawnSync(process.execPath, [row.script, out, ...options],
        { cwd: root, env: process.env, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    const file = path.join(out, 'report.json'), bytes = fs.existsSync(file) ? fs.readFileSync(file) : undefined;
    const native = bytes && JSON.parse(bytes);
    const passed = result.status === 0 && native?.status?.startsWith('PASS');
    report.cases.push({ name: row.name, script: row.script, options, exitCode: result.status,
        status: native?.status ?? 'NO_REPORT', passed, report: file,
        sha256: bytes && createHash('sha256').update(bytes).digest('hex'), error: native?.error });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.cases.at(-1)));
}
report.status = report.cases.every(row => row.passed) ? 'PASS_NATIVE_APP_REGRESSIONS' : 'FAIL';
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (report.status === 'FAIL') process.exitCode = 1;
