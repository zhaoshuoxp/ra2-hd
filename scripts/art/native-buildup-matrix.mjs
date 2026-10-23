// Sequential isolated sessions; a passing receipt may be reused only verbatim.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [receipt, authoring, prefix] = process.argv.slice(2);
assert(receipt && authoring && prefix, 'Provide package receipt, authoring and unique output prefix');
const packageInfo = JSON.parse(await fs.readFile(receipt));
const reusePrefix = process.argv.find(arg => arg.startsWith('--reuse-prefix='))?.slice(15);
const selection = JSON.parse(await fs.readFile(authoring));
const complete = selection.scope === 'ALL_SELECTED_BUILDUP_SEQUENCES';
const excludedTheaters = process.argv.find(arg => arg.startsWith('--exclude-theaters='))?.slice(19).split(',') ?? [];
const configurations = [4, 2, 1].flatMap(density => ['yr', 'ra2'].flatMap(edition =>
    (density === 1 ? ['TEMPERATE'] : complete
        ? [...new Set(selection.families.filter(f => f.editions.includes(edition)).map(f => f.theater))].filter(t => !excludedTheaters.includes(t))
        : ['TEMPERATE', 'SNOW']).map(theater => ({ density, edition, theater }))));
const entries = [];
for (const { density, edition, theater } of configurations) {
            let output = `${prefix}-${edition}-${theater.toLowerCase()}-${density}-v1`;
            let file = path.join(output, 'report.json');
            let report;
            try { report = JSON.parse(await fs.readFile(file)); } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
            if (!report && reusePrefix) {
                const previousOutput = `${reusePrefix}-${edition}-${theater.toLowerCase()}-${density}-v1`;
                try {
                    const previous = JSON.parse(await fs.readFile(path.join(previousOutput, 'report.json')));
                    if (previous.status === 'PASS_SELECTED_NATIVE_CASES') {
                        output = previousOutput; file = path.join(output, 'report.json'); report = previous;
                    }
                } catch (error) { if (error.code !== 'ENOENT') throw error; }
            }
            if (report) {
                assert.equal(report.status, 'PASS_SELECTED_NATIVE_CASES', 'Preserve failed evidence; use a new prefix');
                assert.equal(report.app, packageInfo.app);
                assert.equal(report.resources, packageInfo.resources);
                assert.equal(report.edition, edition);
                assert.equal(report.scope.theater, theater);
                assert.equal(report.scope.density, density);
            } else {
                await new Promise((resolve, reject) => {
                    const child = spawn(process.execPath, ['scripts/art/native-buildup.mjs', receipt,
                        authoring, output, edition, theater, String(density)], { stdio: 'inherit' });
                    child.on('error', reject);
                    child.on('exit', code => code === 0 ? resolve() : reject(Error(`${output}: exit ${code}`)));
                });
                report = JSON.parse(await fs.readFile(file));
                assert.equal(report.status, 'PASS_SELECTED_NATIVE_CASES');
            }
            const bytes = await fs.readFile(file);
            entries.push({ edition, theater, density, output, status: report.status,
                reportSha256: createHash('sha256').update(bytes).digest('hex'),
                cases: Object.keys(report.cases), worldAllocation: report.worldAllocation });
            await fs.writeFile(`${prefix}-matrix.json`, JSON.stringify({
                status: entries.length === configurations.length ? (excludedTheaters.length
                    ? 'PASS_SUPPORTED_NATIVE_MATRIX_WITH_EXPLICIT_THEATER_BLOCKERS' : 'PASS_COMPLETE_NATIVE_MATRIX') : 'RUNNING',
                excludedTheaters, entries,
            }, null, 2) + '\n');
            console.log(JSON.stringify({ output, status: report.status, complete: entries.length }));
}
