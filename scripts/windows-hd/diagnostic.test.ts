import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DIAGNOSTIC_ID, parseDiagnosticArgs, scenarioPreferences, summarize } from '../../desktop/diagnostic-schema.mjs';
import { exportReports, verifyKit } from '../../desktop/diagnostic-export.mjs';
import { writeEvidenceZip } from '../../desktop/diagnostic-zip.mjs';

test('fixed experiment identity and one-variable controls reject malformed inputs', () => {
    const config = parseDiagnosticArgs(['--diag-mode=2x', '--diag-scene=stress']);
    expect(config.contentSize).toEqual([1707, 1067]);
    expect(config.presentationHeight).toBe(900);
    expect(config.displayMode).toBe('native-fullscreen');
    expect(config.shadows).toBe(3);
    expect(scenarioPreferences(config)['_edition:yr:_r_lastMap']).toBe('xmp27t8.map');
    expect(scenarioPreferences(config)['_edition:yr:_r_lastBots'].split(',')).toHaveLength(40);
    expect(parseDiagnosticArgs(['--diag-control=720p']).shadows).toBe(3);
    expect(() => parseDiagnosticArgs(['--diag-seconds=1000'])).toThrow();
    expect(() => parseDiagnosticArgs(['--diag-mode=software'])).toThrow();
});

test('tail statistics retain raw values and count actual threshold exceedances', () => {
    const values = [10, 33, 34, 50, 51, 100, 101];
    expect(summarize(values)).toEqual({ n: 7, median: 50, p95: 101, p99: 101,
        maximum: 101, above33ms: 5, above50ms: 3, above100ms: 1 });
    expect(values).toEqual([10, 33, 34, 50, 51, 100, 101]);
    expect(summarize([]).median).toBeNull();
});

test('evidence ZIP round-trips binary data and refuses overwrite or traversal', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-winzip-'));
    const file = path.join(root, 'raw.json'), archive = path.join(root, 'return.zip');
    await fs.writeFile(file, Buffer.from([0, 1, 255, 13, 10]));
    await writeEvidenceZip(archive, [{ name: 'runs/test/raw.json', file }]);
    const result = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(list(z.read("runs/test/raw.json")))', archive], { encoding: 'utf8' });
    expect(result.trim()).toBe('[0, 1, 255, 13, 10]');
    await expect(writeEvidenceZip(archive, [])).rejects.toThrow();
    await expect(writeEvidenceZip(path.join(root, 'unsafe.zip'), [{ name: '../escape', file }])).rejects.toThrow('Unsafe evidence name');
});

test('export pins manifest identity and excludes profiles, credentials and unrelated files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-winexport-'));
    const manifest = JSON.stringify({ schemaVersion: 1, diagnosticId: DIAGNOSTIC_ID, files: [] });
    await fs.writeFile(path.join(root, 'diagnostic-manifest.json'), manifest);
    const runDir = path.join(root, 'Diagnostic-Runs/2026-10-08T00-00-00-000Z-small-4x-none');
    await fs.mkdir(path.join(runDir, 'Profile'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify({ diagnosticId: DIAGNOSTIC_ID,
        manifestSha256: createHash('sha256').update(manifest).digest('hex'), config: { experimentId: 'test' }, status: 'FAILED' }));
    await fs.writeFile(path.join(runDir, 'errors.json'), '["raw failure retained"]');
    await fs.writeFile(path.join(runDir, 'Profile/Cookies'), 'secret');
    await fs.writeFile(path.join(runDir, 'arbitrary.txt'), 'secret');
    for (const name of ['Launch-Diagnostics.cmd', 'Export-Reports.cmd', 'Verify-Kit.cmd', 'Run-Control.cmd']) await fs.writeFile(path.join(root, name), '@echo off');
    const result = await exportReports(root);
    const names = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(z.namelist())', result.destination], { encoding: 'utf8' });
    expect(names).toContain('errors.json'); expect(names).not.toContain('Cookies'); expect(names).not.toContain('arbitrary.txt');
    expect(names).toContain('launchers/Run-Control.cmd');
    await fs.symlink(path.join(runDir, 'Profile/Cookies'), path.join(runDir, 'phases.json'));
    await expect(exportReports(root)).rejects.toThrow('Unsafe file');
});

test('full kit verification detects corruption and rejects paths leaving the kit', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-winverify-'));
    await fs.writeFile(path.join(root, 'payload.bin'), 'expected');
    const row = { file: 'payload.bin', bytes: 8, sha256: createHash('sha256').update('expected').digest('hex') };
    const writeManifest = files => fs.writeFile(path.join(root, 'diagnostic-manifest.json'),
        JSON.stringify({ schemaVersion: 1, diagnosticId: DIAGNOSTIC_ID, files }));
    await writeManifest([row]); expect((await verifyKit(root)).status).toBe('PASS');
    await fs.writeFile(path.join(root, 'payload.bin'), 'corrupt!');
    expect((await verifyKit(root)).failures).toEqual(['payload.bin']);
    await writeManifest([{ ...row, file: '../outside' }]);
    await expect(verifyKit(root)).rejects.toThrow('Unsafe manifest path');
});
