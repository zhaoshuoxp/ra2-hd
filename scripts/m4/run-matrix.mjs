import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let failed = 0;
for (const row of cases) {
    const args = Object.entries(row).map(([key, value]) => `--${key}=${value}`);
    const log = path.resolve(row.out + '.log');
    const handle = fs.openSync(log, 'wx');
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'benchmark.mjs'), ...args],
        { cwd: process.cwd(), env: process.env, stdio: ['ignore', handle, handle] });
    fs.closeSync(handle);
    const reportFile = path.join(row.out, 'report.json');
    const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : {};
    if (result.status !== 0 || report.status !== 'COMPLETE') failed++;
    console.log(JSON.stringify({ out: row.out, exitCode: result.status, status: report.status,
        fps: report.summary?.callbackFps, p95: report.summary?.frameMs.p95, onePercentLow: report.summary?.onePercentLow,
        simulationRatio: report.summary?.simulationRatio, callbackGate: report.summary?.callbackGate, failure: report.failure }));
}
if (failed) process.exitCode = 1;
