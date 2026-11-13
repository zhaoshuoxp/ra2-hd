import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function sha(file) {
    const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
const prior = await read(path.join(base, 'native-stage/stage.json'));
assert.equal(execFileSync('git', ['diff', '--name-only', prior.sourceHead, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim(), '');
const reports = ['opening-native-v3/report.json', 'coverage-2x-v1/report.json', 'coverage-4x-v1/report.json',
    'poses-native-v1/report.json', 'static-check.json'];
const pins = [];
for (const file of reports) {
    const report = await read(path.join(base, file)); assert(report.status.startsWith('PASS_'), file);
    pins.push({ file, sha256: await sha(path.join(base, file)), status: report.status });
}
const review = await read(path.join(base, 'compact-review/review.json'));
assert.equal(await sha(review.file), review.sha256);
const output = path.join(base, 'delivery-stage'); await fs.mkdir(output, { recursive: false });
const folder = path.join(output, 'RA2-HD-M3.1-Mac-arm64-20261025-R7');
execFileSync('/bin/cp', ['-cR', prior.folder, folder]);
const app = path.join(folder, path.basename(prior.app));
await fs.copyFile(review.file, path.join(folder, path.basename(review.file)), constants.COPYFILE_FICLONE);
await fs.mkdir(path.join(folder, 'Validation'));
for (const pin of pins) await fs.copyFile(path.join(base, pin.file),
    path.join(folder, 'Validation', pin.file.replaceAll('/', '-')), constants.COPYFILE_FICLONE);
await fs.copyFile(path.join(root, 'docs/m3-1-hd-completion-r7-source.json'), path.join(folder, 'Validation/source-checkpoint.json'));
const validation = { status: 'PASS_STAGED_MAC_NATIVE_AND_STATIC_CHECKS_PENDING_EXTRACTED_PACKAGE_SMOKE',
    sourceHead: prior.sourceHead, reusedIdentities: 23, newCompleteFamilies: 6,
    nativeEvidence: pins, review: { file: path.basename(review.file), sha256: review.sha256, images: review.images.length },
    fixedWorldBudgetsMiB: { '2x': 512, '4x': 1280 }, userVisualAcceptance: 'PENDING', nativeWindows: 'NOT_RUN_ON_THIS_MAC',
    boundary: 'Normal opening is natural scripted behavior with accelerated simulation. Posed states and four injected civilians are separate labeled diagnostics. Prior complete-mission and save evidence remains matched to its original builds.' };
await save(path.join(folder, 'R7-VALIDATION.json'), validation);
const infoFile = path.join(app, 'Contents/Resources/M3.1-Package-Info.json'), info = await read(infoFile);
await save(infoFile, { ...info, nativeValidation: 'PASS_STAGED_MAC_NATIVE_AND_STATIC_CHECKS', nativeEvidence: pins });
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
const expectedResources = new Map((await read(path.join(base, 'native-stage/resource-inventory.json'))).map(row => [row.file, row]));
const rows = []; let checkedResources = 0;
async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name), relative = path.relative(folder, file), stat = await fs.lstat(file);
        if (entry.isSymbolicLink()) {
            assert((await fs.realpath(file)).startsWith(app + path.sep));
            rows.push({ file: relative, link: await fs.readlink(file), mode: stat.mode & 0o7777 });
        } else if (entry.isDirectory()) await collect(file);
        else {
            assert(entry.isFile()); const digest = await sha(file);
            rows.push({ file: relative, bytes: stat.size, mode: stat.mode & 0o7777, sha256: digest });
            const prefix = path.join(app, 'Contents/Resources/GameResources') + path.sep;
            if (file.startsWith(prefix)) {
                const resource = file.slice(prefix.length), expected = expectedResources.get(resource); assert(expected, resource);
                assert.equal(digest, expected.sha256, resource); assert.equal(stat.size, expected.bytes, resource); checkedResources++;
            }
        }
    }
}
await collect(folder); assert.equal(checkedResources, 14067);
rows.sort((a, b) => a.file.localeCompare(b.file));
const manifestFile = path.join(folder, 'PACKAGE-MANIFEST.json');
await save(manifestFile, { sourceHead: prior.sourceHead, files: rows, manifestExcludedFromSelfInventory: 'PACKAGE-MANIFEST.json' });
rows.push({ file: 'PACKAGE-MANIFEST.json', bytes: (await fs.stat(manifestFile)).size,
    mode: (await fs.stat(manifestFile)).mode & 0o7777, sha256: await sha(manifestFile) });
rows.sort((a, b) => a.file.localeCompare(b.file)); await save(path.join(output, 'inventory.json'), rows);
const receipt = { status: 'PASS_INDEPENDENT_MAC_ASSEMBLY_PENDING_DESKTOP_ZIP_NATIVE_TEST', folder, app,
    executable: prior.executable, sourceHead: prior.sourceHead, entries: rows.length, verifiedResourceFiles: checkedResources,
    inventorySha256: await sha(path.join(output, 'inventory.json')), reviewSha256: review.sha256,
    nativeReports: pins, metadataOnlyResigningAfterStagedNativeChecks: true };
await save(path.join(output, 'stage.json'), receipt);
console.log(JSON.stringify(receipt));
