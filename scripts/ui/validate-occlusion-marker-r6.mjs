import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const [input, output] = process.argv.slice(2), out = path.resolve(output);
await fs.mkdir(out);
execFileSync('bun', ['build', 'scripts/ui/occlusion-marker-gpu-r6.ts', '--target', 'browser', '--format', 'iife',
    '--outfile', path.join(out, 'fixture.js')], { stdio: 'pipe' });
const app = await electron.launch({ args: ['--user-data-dir=' + path.join(out, 'profile'), path.resolve('scripts/ui/feedback-art-shell.mjs')] });
const report = { status: 'RUNNING', cases: [], errors: [] };
try {
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    await page.addScriptTag({ path: path.join(out, 'fixture.js') });
    for (const edition of ['ra2', 'yr']) {
        const source = JSON.parse(await fs.readFile(path.join(input, edition + '-behind.json')));
        const result = await page.evaluate(source => window.probeOcclusionMarker(source), source);
        for (const row of result.rows) for (const key of ['expectedPng', 'actualPng']) {
            if ([0, 4, 9, 13, 17].includes(row.frame))
                await fs.writeFile(path.join(out, `${edition}-${row.control}-${row.frame}-${key}.png`), Buffer.from(row[key], 'base64'));
            delete row[key];
        }
        report.cases.push({ edition, ...result });
        assert(result.productionFlipY, 'Production canvas atlas must match ordinary bottom-up sprite UVs');
        assert.equal(result.glError, 0);
        assert(result.rows.filter(r => r.control === 'production').every(r => r.iou === 1 && r.centerErrorNative === 0
            && r.actualCount === r.expectedCount), 'Every actual production-material GPU silhouette must equal its intended source frame');
        assert(result.rows.some(r => r.control === 'reproducedR5' && r.iou < .1), 'Negative control must reproduce the old wrong-frame sampling');
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_36_PRODUCTION_GPU_FRAMES_EXACT_AND_R5_FAILURE_REPRODUCED';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; }
finally {
    await app.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(report.status);
