import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const root = path.resolve(import.meta.dirname, '../..');
const runtime = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const prior = path.join(root, '.artifacts/m3-1/campaign-entry-r1/stage');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
async function sha(file) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
const accepted = await read(path.join(root, 'docs/m3-1-final-acceptance.json'));
const original = await read(path.join(prior, 'stage.json'));
const inventoryFile = path.join(prior, 'inventory.json');
assert.equal(await sha(inventoryFile), original.packageInventorySha256);
assert.equal(original.identity.acceptedRuntimeSourceHead, accepted.source.runtimeHead);
const originalRows = await read(inventoryFile);
for (const [index, row] of originalRows.entries()) {
    const file = path.join(original.folder, row.file), stat = await fs.lstat(file);
    assert.equal(stat.mode & 0o7777, row.mode, row.file);
    if (row.link) assert.equal(await fs.readlink(file), row.link, row.file);
    else { assert.equal(stat.size, row.bytes, row.file); assert.equal(await sha(file), row.sha256, row.file); }
    if ((index + 1) % 2000 === 0) console.log(JSON.stringify({ phase: 'PRIOR_DELIVERY_VERIFIED', entries: index + 1 }));
}
const metadata = await read(path.join(runtime, 'package.json')), build = await read(path.join(runtime, 'build.json'));
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(metadata.sourceHead, sourceHead);
assert.equal(execFileSync('git', ['diff', '--name-only', sourceHead, '--', 'src', 'desktop', 'public'], { cwd: root, encoding: 'utf8' }).trim(), '');
const changedRuntimePaths = execFileSync('git', ['diff', '--name-only', accepted.source.runtimeHead, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim().split('\n').sort();
assert.deepEqual(changedRuntimePaths, [
    "desktop/main.mjs",
    "public/res/locale/en-US.json",
    "public/res/locale/zh-CN.json",
    "public/res/locale/zh-TW.json",
    "public/res/presentation/campaign-backdrop-soviet-score-original-r4.png",
    "public/res/presentation/campaign-backdrop-topography-r2a.png",
    "public/res/presentation/campaign-backdrop-world-r2a.png",
    "public/res/presentation/campaign-loading-housing-r2.png",
    "public/res/ui/dialog-background-r2.png",
    "public/res/ui/dialog-background-yr-r2.png",
    "public/res/ui/save-files-allied-r3.png",
    "public/res/ui/save-files-neutral-r3.png",
    "public/res/ui/save-files-soviet-r3.png",
    "src/gui/campaign/CampaignAnimation.ts",
    "src/gui/campaign/CampaignBackdrop.tsx",
    "src/gui/campaign/CampaignChrome.tsx",
    "src/gui/campaign/CampaignInterfaceHd.ts",
    "src/gui/campaign/CampaignLoadingArtwork.ts",
    "src/gui/campaign/CampaignMediaPlayer.ts",
    "src/gui/campaign/CampaignPresentation.ts",
    "src/gui/campaign/CampaignResult.tsx",
    "src/gui/campaign/CampaignSaveLibrary.ts",
    "src/gui/campaign/CampaignScoreMatte.ts",
    "src/gui/campaign/CampaignScorePresentation.ts",
    "src/gui/campaign/CampaignSelection.tsx",
    "src/gui/campaign/CampaignSubtitleTracks.ts",
    "src/gui/campaign/CampaignSubtitles.ts",
    "src/gui/component/MenuButton.tsx",
    "src/gui/hd/NativeUiBackdrop.tsx",
    "src/gui/hd/UiArt.ts",
    "src/gui/hd/nativeUiBackdrops.json",
    "src/gui/save/SaveBrowser.ts",
    "src/gui/save/SaveBrowserModel.ts",
    "src/gui/save/SaveBrowserScreen.ts",
    "src/gui/save/SaveMenuArt.ts",
    "src/gui/save/SkirmishSaveDialog.css",
    "src/gui/screen/ScreenType.ts",
    "src/gui/screen/game/GameMenu.ts",
    "src/gui/screen/game/GameScreen.ts",
    "src/gui/screen/game/component/Hud.ts",
    "src/gui/screen/game/component/hud/GameMenuContentArea.ts",
    "src/gui/screen/game/component/hud/SidebarMenu.ts",
    "src/gui/screen/game/gameMenu/GameMenuController.ts",
    "src/gui/screen/game/gameMenu/ScreenType.ts",
    "src/gui/screen/game/loadingScreen/CampaignLoadingScreenApi.tsx",
    "src/gui/screen/mainMenu/MainMenuController.ts",
    "src/gui/screen/mainMenu/MainMenuRootScreen.ts",
    "src/gui/screen/mainMenu/campaign/CampaignScreen.ts",
    "src/gui/screen/mainMenu/component/MainMenu.ts",
    "src/gui/screen/mainMenu/component/MenuSlotAnimationRunner.ts",
    "src/gui/screen/mainMenu/score/ScoreScreen.ts",
    "src/gui/trainer/TrainerToolbar.tsx",
    "src/gui/trainer/trainer.css"
].sort());
await fs.mkdir(output, { recursive: false });
const folder = path.join(output, 'RA2-HD-M3.1-Mac-arm64-20261024-R4');
run('/bin/cp', ['-cR', original.folder, folder]);
const title = 'Red Alert 2 HD M3.1 Campaign R4';
const app = path.join(folder, title + '.app');
await fs.rename(path.join(folder, path.basename(original.app)), app);
const payload = path.join(app, 'Contents/Resources/app'), resources = path.join(app, 'Contents/Resources/GameResources');
await fs.rm(path.join(payload, 'dist'), { recursive: true });
await fs.cp(path.join(runtime, 'dist'), path.join(payload, 'dist'), { recursive: true });
await fs.cp(path.join(runtime, 'desktop'), path.join(payload, 'desktop'), { recursive: true });
await fs.copyFile(path.join(root, 'scripts/m3-1/mac-package-main.mjs'), path.join(payload, 'desktop/mac-package-main.mjs'));
await save(path.join(payload, 'package.json'), { ...metadata, main: 'desktop/mac-package-main.mjs', productName: title,
    distributionKind: 'M3.1-MAC-ARM64-INDEPENDENT-TEST', distributionRevision: 'FEEDBACK-R4', campaignEntry: 'ra2-soviet01',
    acceptedRuntimeSourceHead: accepted.source.runtimeHead, packagingSourceHead: sourceHead });
for (const file of build.web) {
    assert.equal((await fs.stat(path.join(payload, 'dist', file.path))).size, file.bytes);
    assert.equal(await sha(path.join(payload, 'dist', file.path)), file.sha256);
}
const desktop = await fs.readdir(path.join(runtime, 'desktop'));
for (const name of desktop) {
    assert.equal(await sha(path.join(payload, 'desktop', name)), await sha(path.join(runtime, 'desktop', name)));
    if (!['main.mjs', 'app-files.json'].includes(name)) {
        assert.equal(await sha(path.join(payload, 'desktop', name)), await sha(path.join(original.app, 'Contents/Resources/app/desktop', name)));
    }
}
const identity = { ...original.identity, runtimeSourceHead: sourceHead, packagingSourceHead: sourceHead,
    acceptedRuntimeSourceHead: accepted.source.runtimeHead, distributionRevision: 'FEEDBACK-R4', campaignEntry: 'ra2-soviet01',
    sourceStatus: process.argv.includes('--provisional') ? 'PROVISIONAL_NATIVE_TEST_CANDIDATE'
        : 'CAMPAIGN_FEEDBACK_R3_TECHNICAL_VALIDATION_PENDING_USER_REVIEW', changedRuntimePaths };
await save(path.join(app, 'Contents/Resources/M3.1-Package-Info.json'), identity);
await save(path.join(folder, 'FEEDBACK-R4.json'), { ...identity,
    changes: ['Clean faceted HD faction arrows and mutually exclusive pointer/keyboard animation.',
        'Original faction hover sounds, registered loading-map locator and smaller transparent score apparatus.',
        'Small native-style mission speech below compact progress at upper right; fully visible loading cables.',
        'Brighter retail yellow-orange progress lighting on the same glossy cylinder.',
        'Restored the original Soviet score background with one proportional insignia and responsive outer rays; generated HD replacement remains blocked.',
        'Media-time synchronized English, Simplified Chinese and Traditional Chinese cinematic captions.',
        'Original campaign accomplishment/failure voices and victory cheer.',
        'Named campaign save/load browser reuses the bugfix UI, with legacy manual-slot compatibility and modified-save gates.'],
    preserved: 'All 14,004 bundled game/resource files, original map, rules, scripts, checkpoint format and prior accepted art.',
    baselineReview: 'M3.1-Review.html is historical accepted-base evidence; M3.1-Feedback-R4-Review.html contains current focused native checks.' });
if (process.argv.includes('--provisional')) identity.sourceStatus = 'PROVISIONAL_NATIVE_TEST_CANDIDATE';
else await fs.copyFile(path.join(root, '.artifacts/m3-1/feedback-r4/M3.1-Feedback-R4-Review.html'),
    path.join(folder, 'M3.1-Feedback-R4-Review.html'));
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `${title} - Mac Apple Silicon manual test

Extract this ZIP, then open ${title}.app.
This is the M3.1 campaign app. It opens the original RA2 faction selection directly.
Choose Soviet (the red emblem), leaving difficulty on Normal, to start Red Dawn.
The original introduction plays before the mission loading screen. Skip is available.
The app contains its own complete resources and works away from the checkout.

If you switch to Yuri's Revenge and open Campaign, choose Open RA2 campaign.
RA2 Soviet 01 Normal is the available campaign. The other campaigns remain unavailable.
The Load button opens the campaign save list; a new mission starts from the Soviet emblem.
HD is enabled by default. Original, 2X and 4X are available in Graphics options.
The opening bridge starts broken and is repaired by an engineer entering its repair hut.
Escape opens the mission menu. Named saves retain the verified campaign checkpoint format; legacy manual saves remain readable.

Settings and saves retain the existing M3.1 profile:
~/Library/Application Support/RA2 HD M3.1 Campaign Test 20261023
This ZIP contains no user settings or saves. Other apps and their profiles are untouched.
M3.1-Review.html contains the accepted base screenshots and recordings.
M3.1-Feedback-R4-Review.html contains the current native screenshots and explicitly identifies the blocked generated background.
FEEDBACK-R4.json records the current changes. The score background retains Original pixels; its generated HD replacement was rejected by the image tool and remains pending. Cinematic captions follow the selected language.
Enable the optional trainer in Settings; using it marks the mission modified and disables formal checkpoint/progress eligibility.
This private local test app is ad-hoc signed, not notarized.
`);
const plist = path.join(app, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleIdentifier: 'local.ra2hd.campaign.m31.20261024.feedbackr4',
    CFBundleName: title, CFBundleDisplayName: title, CFBundleVersion: '37' })) {
    run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
}
run('/usr/bin/xattr', ['-cr', app]);
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const oldResources = new Map(originalRows.filter(row => row.file.includes('/Contents/Resources/GameResources/'))
    .map(row => [row.file.split('/Contents/Resources/GameResources/')[1], row]));
assert.equal(oldResources.size, 14004);
await fs.unlink(path.join(folder, 'PACKAGE-MANIFEST.json'));
const rows = []; let verifiedResources = 0;
async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name), relative = path.relative(folder, file), stat = await fs.lstat(file);
        if (entry.isDirectory()) await collect(file);
        else if (entry.isSymbolicLink()) {
            assert((await fs.realpath(file)).startsWith(app + path.sep));
            rows.push({ file: relative, link: await fs.readlink(file), mode: stat.mode & 0o7777 });
        } else {
            assert(entry.isFile()); const digest = await sha(file);
            rows.push({ file: relative, bytes: stat.size, sha256: digest, mode: stat.mode & 0o7777 });
            if (file.startsWith(resources + path.sep)) {
                const resource = path.relative(resources, file), expected = oldResources.get(resource);
                assert(expected, resource); assert.equal(digest, expected.sha256, resource); assert.equal(stat.size, expected.bytes, resource);
                assert.notEqual(stat.ino, (await fs.stat(path.join(original.folder, expected.file))).ino, resource);
                verifiedResources++;
                if (verifiedResources % 2000 === 0) console.log(JSON.stringify({ phase: 'UNCHANGED_INDEPENDENT_RESOURCES_VERIFIED', files: verifiedResources }));
            }
        }
    }
}
await collect(folder); assert.equal(verifiedResources, oldResources.size);
rows.sort((a, b) => a.file.localeCompare(b.file));
await save(path.join(folder, 'PACKAGE-MANIFEST.json'), { ...identity, files: rows, manifestExcludedFromSelfInventory: 'PACKAGE-MANIFEST.json' });
const manifest = path.join(folder, 'PACKAGE-MANIFEST.json');
rows.push({ file: 'PACKAGE-MANIFEST.json', bytes: (await fs.stat(manifest)).size, sha256: await sha(manifest), mode: (await fs.stat(manifest)).mode & 0o7777 });
await save(path.join(output, 'inventory.json'), rows);
const receipt = { status: 'PASS_INDEPENDENT_MAC_ASSEMBLY_PENDING_DESKTOP_ZIP_NATIVE_TEST', folder, app, resources,
    executable: original.executable, identity, entries: rows.length, logicalBytes: rows.reduce((sum, row) => sum + (row.bytes ?? 0), 0),
    verifiedUnchangedResourceFiles: verifiedResources, priorPackageInventorySha256: original.packageInventorySha256,
    packageInventorySha256: await sha(path.join(output, 'inventory.json')), webFiles: build.web.length, desktopFiles: desktop.length,
    packagingTools: await Promise.all(['package-feedback-r4.mjs', 'mac-package-main.mjs'].map(async name => ({
        path: 'scripts/m3-1/' + name, sha256: await sha(path.join(root, 'scripts/m3-1', name)) }))) };
await save(path.join(output, 'stage.json'), receipt);
console.log(JSON.stringify({ status: receipt.status, folder, entries: rows.length, verifiedResources }));
