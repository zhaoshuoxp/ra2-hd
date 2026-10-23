// Build a relocatable local test folder without modifying the verified runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateProfile } from '../../../desktop/profile.mjs';
import {
    registerHdResources, sovietUnitIdentities, vxlUnitIdentities,
    sovietBatchIdentities, sovietBatchRevisions,
} from '../../../desktop/hd-profile.mjs';

const source = path.resolve('.local');
const deliveryRoot = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const delivery = await read(path.join(deliveryRoot, 'delivery.json'));
await fs.mkdir(out, { recursive: false });
const resources = path.join(out, 'Game Resources');
const copies = new Map();
async function copy(relative) {
    if (copies.has(relative)) return;
    const file = path.join(source, relative);
    assert.equal(await fs.realpath(file), file);
    const bytes = await fs.readFile(file);
    const target = path.join(resources, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(file, target);
    assert.equal(sha(await fs.readFile(target)), sha(bytes));
    copies.set(relative, { file: relative, bytes: bytes.length, sha256: sha(bytes) });
}
const directories = new Set();
async function directory(relative) {
    if (directories.has(relative)) return;
    directories.add(relative);
    for (const entry of await fs.readdir(path.join(source, relative), { withFileTypes: true })) {
        const name = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) await directory(name);
        else { assert(entry.isFile()); await copy(name); }
    }
}
async function family(relative) {
    await directory(path.posix.dirname(relative));
    const data = await read(path.join(source, relative));
    for (const member of data.members ?? [])
        await directory(`hd-packs/${member.packId}/${member.revision}`);
}
const core = await validateProfile(source);
await copy('ra2-core-manifest.json');
await copy('upstream-support/manifest.json');
for (const file of core.routes.values()) await copy(path.relative(source, file));
for (const file of ['hd-packs/power-plant-authored/1/family.json',
    'hd-packs/soviet-power-plant-authored/2/family.json']) await family(file);
for (const name of Object.keys(sovietBatchIdentities))
    await family(`hd-packs/soviet-${name}-authored/${sovietBatchRevisions[name]}/family.json`);
for (const entry of Object.values(sovietUnitIdentities)) await family(entry.familyPath);
for (const entry of Object.values(vxlUnitIdentities)) await directory(path.posix.dirname(entry.path));
await directory('hd-packs/conscript-authored/1');
await directory('hd-packs/rhino-authored/1');
await validateProfile(resources);
const expected = await registerHdResources(source);
const actual = await registerHdResources(resources);
assert.deepEqual(actual.availability, expected.availability);
assert(actual.availability.sovietUnits.startsWith('22 of 24'));
for (const file of actual.routes.values()) assert(file.startsWith(resources + path.sep));

const app = path.join(out, 'RA2 HD Soviet Units.app');
await fs.mkdir(path.join(app, 'Contents/MacOS'), { recursive: true });
await fs.mkdir(path.join(app, 'Contents/Resources'));
await fs.cp(delivery.app, path.join(app, 'Contents/Resources/Runtime.app'), {
    recursive: true, verbatimSymlinks: true,
});
execFileSync('/usr/bin/clang', ['-O2', '-fobjc-arc', '-arch', 'arm64', '-framework', 'Foundation',
    'scripts/m1/soviet-units/portable-launcher.m', '-o', path.join(app, 'Contents/MacOS/Launch')]);
await fs.writeFile(path.join(app, 'Contents/Info.plist'),
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>' +
    '<key>CFBundleExecutable</key><string>Launch</string>' +
    '<key>CFBundleIdentifier</key><string>local.ra2hd.m17.portable.v3</string>' +
    '<key>CFBundleName</key><string>RA2 HD Soviet Units</string>' +
    '<key>CFBundlePackageType</key><string>APPL</string>' +
    '<key>CFBundleVersion</key><string>3</string></dict></plist>');
for (const file of ['DESO-Green-Canisters-Complete-Review.html', 'coverage.json', 'validation.json'])
    await fs.copyFile(path.join(deliveryRoot, file), path.join(out, file));
await fs.writeFile(path.join(out, 'README.txt'),
    'RA2 HD Soviet Units - local Mac test v3\n\n' +
    'Double-click RA2 HD Soviet Units.app. Keep Game Resources beside the app; move the entire folder together.\n' +
    'No server or developer checkout is required. Review Profile is created here on first launch and does not change existing profiles.\n' +
    'Includes the DESO upper-right firing correction, green canisters and previous naval/HARV corrections. SQD uses Original.\n' +
    'YURIPR remains Original due to the recorded upstream Psi Wave issue. This is a test build, not all-unit final acceptance.\n' +
    'The companion DESO HTML opens directly and defaults to upper-right firing. Continue the same task for feedback.\n');
await fs.writeFile(path.join(out, 'delivery.json'), JSON.stringify({
    ...delivery, reviewLauncher: app, app: path.join(app, 'Contents/Resources/Runtime.app'),
    packagedSource: delivery.source, resources: 'Game Resources',
    review: 'DESO-Green-Canisters-Complete-Review.html',
    packaging: 'Relocatable local folder; native launcher registers sibling resources at startup.',
}, null, 2) + '\n');
await fs.writeFile(path.join(out, 'resource-index.json'), JSON.stringify({
    status: 'PASS_REGISTERED_LOCAL_RESOURCES', availability: actual.availability,
    files: [...copies.values()], totalBytes: [...copies.values()].reduce((n, v) => n + v.bytes, 0),
}, null, 2) + '\n');
console.log(out);
