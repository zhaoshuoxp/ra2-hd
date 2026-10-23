// Record each current painted selection, both densities, plus Original controls.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const [receipt, source, prefix, summary] = process.argv.slice(2);
const authoring = JSON.parse(await fs.readFile(source));
const selected = authoring.families.filter(f => authoring.hdRepaintProgress.registeredCandidateKeys.includes(f.key));
const sessions = [];
const plans = [
    ['yr', 'TEMPERATE', 4, 1], ['yr', 'SNOW', 4, 0],
    ['ra2', 'TEMPERATE', 2, 2], ['ra2', 'SNOW', 2, 3], ['ra2', 'TEMPERATE', 1, 1],
];
const supports = (family, edition) => !family.editions || family.editions.includes(edition);
const yrOnly = selected.filter(f => supports(f, 'yr') && !supports(f, 'ra2'));
for (const [theater, owner] of [['TEMPERATE', 2], ['SNOW', 3]]) {
    const keys = yrOnly.filter(f => f.theater === theater).map(f => f.key);
    if (keys.length) plans.push(['yr', theater, 2, owner, keys]);
}
const originalKeys = yrOnly.filter(f => f.theater === 'TEMPERATE').map(f => f.key);
if (originalKeys.length) plans.push(['yr', 'TEMPERATE', 1, 1, originalKeys]);
const activePlans = plans.filter(([edition, theater, , , keys]) => selected.some(f => f.theater === theater
    && supports(f, edition) && (!keys || keys.includes(f.key))));
for (const [edition, theater, density, owner, keys] of activePlans) {
    const current = selected.filter(f => f.theater === theater && supports(f, edition)
        && (!keys || keys.includes(f.key)));
    const families = [...new Set(current.map(f => f.identity))];
    if (authoring.scope === 'ALL_SELECTED_BUILDUP_SEQUENCES' && families.includes('GAAIRC')) families.push('AMRADR');
    const output = `${prefix}-${edition}-${theater.toLowerCase()}-${density}-v1`;
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/art/native-buildup.mjs', receipt, source, output,
            edition, theater, String(density), `--owner=${owner}`, `--families=${families.join(',')}`], { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(Error(`${output}: exit ${code}`)));
    });
    const file = path.join(output, 'report.json'), bytes = await fs.readFile(file);
    const report = JSON.parse(bytes);
    assert.equal(report.status, 'PASS_SELECTED_NATIVE_CASES');
    assert.deepEqual(Object.keys(report.cases), families);
    for (const f of current) {
        assert.equal(report.cases[f.identity].expectedMemberSha256, f.newMember.sha256);
        assert.equal(report.cases[f.identity].frames, f.frames);
    }
    if (families.includes('AMRADR')) {
        const family = current.find(f => f.identity === 'GAAIRC');
        assert.equal(report.cases.AMRADR.expectedMemberSha256, family.newMember.sha256);
        assert.equal(report.cases.AMRADR.frames, family.frames);
    }
    sessions.push({ report: file, sha256: createHash('sha256').update(bytes).digest('hex'), scope: report.scope,
        ownerColor: report.ownerColor, nativeCases: families,
        clips: Object.values(report.cases).flatMap(c => [c.buildClip, c.saleClip]) });
    await fs.writeFile(summary, JSON.stringify({
        status: sessions.length === activePlans.length ? 'PASS_PAINTED_NATIVE_SCOPE_MATRIX' : 'RUNNING',
        candidateArt: source, plannedSessions: activePlans.length, sessions,
    }, null, 2) + '\n');
    console.log(`${sessions.length}/${activePlans.length} native review sessions complete`);
}
