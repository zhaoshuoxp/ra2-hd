// Freeze the current native runtime and selected formal resources in one app.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { macResourcePlan } from '../m3-1/mac-resource-plan.mjs';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const review = path.resolve(process.argv[3]), completeCampaign = process.argv.includes('--complete-campaign');
const yuriCampaign = process.argv.includes('--yr-campaigns');
const hdMovies = process.argv.includes('--hd-movies');
const movieAcceptanceFile = process.argv.find(value => value.startsWith('--movie-acceptance='))
    ?.slice('--movie-acceptance='.length);
const movieAcceptance = movieAcceptanceFile
    ? JSON.parse(await fs.readFile(path.resolve(movieAcceptanceFile), 'utf8')) : undefined;
assert(!movieAcceptance || hdMovies && movieAcceptance.schema === 'hd-movie-user-acceptance-v1'
    && movieAcceptance.status === 'USER_ACCEPTED_COMPLETE_CURRENT_MOVIES', 'A matching movie user-acceptance record is required');
assert(!yuriCampaign || completeCampaign, 'YR delivery includes the retained complete original RA2 campaigns');
assert(!hdMovies || yuriCampaign, 'HD movie delivery includes both accepted campaigns');
const deliveryDate = process.argv.find(value => value.startsWith('--delivery-date='))?.slice(16) ?? '20261101';
assert(/^\d{8}$/.test(deliveryDate), 'Delivery date must use YYYYMMDD');
const profileDate = process.argv.find(value => value.startsWith('--profile-date='))?.slice(15) ?? deliveryDate;
assert(/^\d{8}$/.test(profileDate), 'Profile date must use YYYYMMDD');
const checkpointFile = process.argv.find(value => value.startsWith('--campaign-checkpoint='))?.slice(22);
const checkpoint = checkpointFile ? JSON.parse(await fs.readFile(path.resolve(checkpointFile), 'utf8')) : undefined;
if (checkpoint) assert(completeCampaign && Array.isArray(checkpoint.plannedWorldArtMaterialWaits)
    && checkpoint.originalPlayableMaps === 26, 'A current complete-campaign checkpoint is required');
if (yuriCampaign) assert(checkpoint?.yrPlayableMaps === 14 && !checkpoint.plannedWorldArtMaterialWaits.length,
    'A source-qualified fourteen-mission YR delivery checkpoint is required');
const title = completeCampaign ? 'Red Alert 2 HD' : 'Red Alert 2 HD M3.2';
const release = (await fs.readFile(path.join(root, 'src/version.ts'), 'utf8'))
    .match(/export const releaseVersion = "(\d+\.\d+(?:\.\d+)?)"/)?.[1];
assert(release, 'A release version is required');
const bundleRelease = release.split('.').length === 2 ? release + '.0' : release;
const profile = hdMovies ? 'RA2 HD Movies Review ' + profileDate
    : completeCampaign ? 'RA2 HD Campaign Review ' + profileDate : 'RA2 HD M3.2 Review 20261025';
const bootstrap = hdMovies ? 'hd-movies-review-main.mjs' : completeCampaign ? 'campaign-review-main.mjs' : 'm32-review-main.mjs';
const reviewName = hdMovies ? 'HD-Movies-Review.html' : completeCampaign ? 'Campaign-Review.html' : 'M3.2-Review.html';
const app = path.join(out, title + '.app');
const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8' });
const sha = async file => { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); };
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
await fs.mkdir(out, { recursive: false });
const head = run('git', ['rev-parse', 'HEAD']).trim();
const sourceFiles = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const source = await Promise.all([...new Set(sourceFiles)].sort().map(async file => ({ file, sha256: await sha(path.join(root, file)) })));
const sourceDigest = createHash('sha256').update(JSON.stringify(source)).digest('hex');
await save(path.join(out, 'source.json'), { head, sourceDigest, files: source, dirty: run('git', ['status', '--porcelain']),
    policy: 'Current canonical local main snapshot; selected formal resources are frozen independently. Actual user profiles remain external and unchanged.' });
const runtimeSources = source.filter(row => /^(src\/|desktop\/|public\/|package|vite\.config|tsconfig|bun\.lock)/.test(row.file));
const web = path.join(out, 'web');
run('bun', ['run', 'build', '--outDir', web]);
for (const row of runtimeSources) assert.equal(await sha(path.join(root, row.file)), row.sha256, `Runtime changed during build: ${row.file}`);
const plan = await macResourcePlan(path.join(root, '.local'), path.join(root, '.local/campaign'));
let movieFrameRates, acceptedMovieSelection;
if (hdMovies) {
    const selection = JSON.parse(await fs.readFile(path.join(root, '.local/hd-movie-selection.json')));
    const manifest = JSON.parse(await fs.readFile(path.join(root, '.local', selection.manifest)));
    if (movieAcceptance) {
        assert.deepEqual(movieAcceptance.selection, selection, 'Movie acceptance must match the frozen selection');
        assert.equal(await sha(path.join(root, '.local', selection.manifest)), selection.sha256);
        assert.equal(movieAcceptance.identities, manifest.entries.length);
        acceptedMovieSelection = { file: path.relative(root, path.resolve(movieAcceptanceFile)),
            sha256: await sha(path.resolve(movieAcceptanceFile)), manifestSha256: selection.sha256,
            status: movieAcceptance.status, bundledRecord: 'HD-Movies-Acceptance.json' };
    }
    movieFrameRates = {};
    for (const entry of manifest.entries) {
        const fps = entry.video.fpsNumerator / entry.video.fpsDenominator;
        movieFrameRates[fps] = (movieFrameRates[fps] ?? 0) + 1;
    }
    assert.equal(manifest.entries.length, 136); assert(plan.files.includes('hd-movie-selection.json'));
    assert(manifest.entries.every(entry => plan.files.includes(path.posix.join(path.posix.dirname(selection.manifest), entry.file.path))));
}
assert.equal(plan.metadataOverrides.length, 0, 'Preserve current canonical selectors');
assert(plan.campaignFiles.includes('ra2/sov02t/manifest.json'));
const originalMissions = [...new Set(plan.campaignFiles.filter(file => /^ra2\/(sov|all|trn)\d{2}[tsu]\/manifest\.json$/.test(file))
    .map(file => file.replace('/manifest.json', '.map')))].sort();
const yrMissions = [...new Set(plan.campaignFiles.filter(file => /^yr\/(sov|all)\d{2}[tsudl]md\/manifest\.json$/.test(file))
    .map(file => file.replace('/manifest.json', '.map')))].sort();
if (completeCampaign) assert.equal(originalMissions.length, 26, 'Complete original campaign source inventory required');
if (yuriCampaign) assert.equal(yrMissions.length, 14, 'Complete original YR source inventory required');
const missions = [...originalMissions, ...(yuriCampaign ? yrMissions : [])];
await save(path.join(out, 'selected-resources.json'), plan);
run('/bin/cp', ['-cR', path.join(root, 'node_modules/electron/dist/Electron.app'), app]);
const payload = path.join(app, 'Contents/Resources/app'), resources = path.join(app, 'Contents/Resources/GameResources');
await fs.mkdir(payload, { recursive: true });
const copied = [];
async function copy(original, target, relative) {
    assert.equal(await fs.realpath(original), original); await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(original, target, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
    const digest = await sha(original); assert.equal(await sha(target), digest);
    copied.push({ file: relative, bytes: (await fs.stat(target)).size, sha256: digest });
}
const staticFiles = JSON.parse(await fs.readFile(path.join(root, 'desktop/app-files.json'))).filter(file => !file.startsWith('dist/assets/'));
const emitted = await fs.readdir(path.join(web, 'assets'));
assert(emitted.every(name => /^[\w.-]+\.(js|css|png)$/.test(name)));
const webFiles = [...staticFiles, ...emitted.map(name => 'dist/assets/' + name)].sort();
for (const file of webFiles) {
    await copy(path.join(web, file.slice('dist/'.length)), path.join(payload, file), 'app/' + file);
}
await fs.mkdir(path.join(payload, 'desktop'), { recursive: true });
await save(path.join(payload, 'desktop/app-files.json'), webFiles);
for (const name of await fs.readdir(path.join(root, 'desktop'))) if (/\.(mjs|cjs|json)$/.test(name) && name !== 'app-files.json') {
    await copy(path.join(root, 'desktop', name), path.join(payload, 'desktop', name), 'app/desktop/' + name);
}
for (const file of ['LICENSE', 'desktop/icons/app-icon.png']) await copy(path.join(root, file), path.join(payload, file), 'app/' + file);
await copy(path.join(root, 'node_modules/electron/LICENSE'), path.join(payload, 'ELECTRON-LICENSE'), 'app/ELECTRON-LICENSE');
for (const file of plan.files) await copy(path.join(root, '.local', file), path.join(resources, file), 'GameResources/' + file);
for (const file of plan.campaignFiles) await copy(path.join(root, '.local/campaign', file), path.join(resources, 'campaign', file), 'GameResources/campaign/' + file);
await save(path.join(out, 'copied-files.json'), copied);
for (const row of runtimeSources) assert.equal(await sha(path.join(root, row.file)), row.sha256, `Runtime changed during resource freeze: ${row.file}`);
const wrapper = `import { app } from 'electron';\nimport path from 'node:path';\n\nprocess.env.RA2_DESKTOP_USER_DATA ??= path.join(app.getPath('appData'), ${JSON.stringify(profile)});\nprocess.env.RA2_CAMPAIGN_RESOURCE_ROOT = path.join(process.resourcesPath, 'GameResources/campaign');\nprocess.env.RA2_CAMPAIGN_FROZEN_TERRAIN = '0';\nawait import('./distribution-main.mjs');\n`;
await fs.writeFile(path.join(payload, 'desktop', bootstrap), wrapper);
await save(path.join(payload, 'package.json'), { name: 'ra2-hd-unified-desktop', version: bundleRelease, private: true, type: 'module',
    main: 'desktop/' + bootstrap, productName: title, sourceHead: head, sourceDigest, distributionKind: 'complete-macos-arm64-local-review' });
run('/usr/bin/clang', ['-O2', '-arch', 'arm64', '-framework', 'ApplicationServices', path.join(root, 'desktop/native/restore-cursor.c'),
    '-o', path.join(payload, 'desktop/restore-cursor')]);
const plist = path.join(app, 'Contents/Info.plist');
await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/RA2 HD Editions'));
run('python3', ['-c', 'import plistlib,sys\np,title,identifier,release,version=sys.argv[1:]\nd=plistlib.load(open(p,"rb"))\nd.update(CFBundleIdentifier=identifier,CFBundleName=title,CFBundleDisplayName=title,CFBundleExecutable="RA2 HD Editions",CFBundleIconFile="app-icon.icns",CFBundleShortVersionString=release,CFBundleVersion=version)\nplistlib.dump(d,open(p,"wb"))', plist, title,
    completeCampaign ? 'local.ra2hd.campaign.review.' + deliveryDate : 'local.ra2hd.m32.review', bundleRelease, completeCampaign ? deliveryDate : '32']);
await fs.copyFile(path.join(root, 'desktop/icons/app-icon.icns'), path.join(app, 'Contents/Resources/app-icon.icns'));
await fs.copyFile(review, path.join(app, 'Contents/Resources', reviewName));
await fs.copyFile(review, path.join(out, reviewName));
if (acceptedMovieSelection) {
    assert.equal(await sha(path.resolve(movieAcceptanceFile)), acceptedMovieSelection.sha256);
    await fs.copyFile(path.resolve(movieAcceptanceFile), path.join(app, 'Contents/Resources', acceptedMovieSelection.bundledRecord));
}
await save(path.join(app, 'Contents/Resources', completeCampaign ? 'Campaign-Info.json' : 'M3.2-Info.json'), {
    sourceHead: head, sourceDigest, target: 'darwin-arm64',
    missions: completeCampaign ? missions : ['ra2/sov01t.map', 'ra2/sov02t.map'],
    technical: 'See retained native and host evidence', visualAcceptance: hdMovies
        ? movieAcceptance ? 'MOVIES_USER_ACCEPTED_MENU_LOGO_REVIEW_PENDING' : 'COMPLETE_MOVIE_REVIEW_PENDING' : 'FULL_BATCH_PENDING',
    ...(hdMovies ? { milestone: 'M3.4-HD-MOVIES', hdMovieIdentities: 136, fullscreen: 53, radar: 83,
        sourceClock: 'Native per-file frame rates with original dialogue and caption clocks', movieFrameRates,
        ...(acceptedMovieSelection ? { movieAcceptance: acceptedMovieSelection } : {}),
        acceptedCampaigns: { ra2: 26, yr: 14 } } : {}),
    ...(completeCampaign ? { unfinishedMaterial: checkpoint?.plannedWorldArtMaterialWaits
        ?? ['Soviet04 photo0', 'Entire Soviet05 HD loading', 'Snow CAMISC06'],
        ...(checkpoint ? { checkpointSha256: await sha(path.resolve(checkpointFile)),
            storyHdLoading: checkpoint.storyHdLoading, originalQualifications: checkpoint.retainedOriginalQualifications } : {}),
        scope: hdMovies ? `All 26 accepted RA2 missions and all 14 accepted YR missions with all 136 HD movies. ${movieAcceptance
            ? 'Movies are user accepted; the new Yuri menu logo awaits user visual review.' : 'Complete-film user acceptance remains pending.'}` : yuriCampaign
            ? 'All 26 retained original RA2 missions and all 14 original YR missions. YR user acceptance remains pending.'
            : 'Original RA2 campaign delivery. See the current source checkpoint for YR availability.' }
        : { approvedSamples: ['VLAD representative material/lines', 'Soviet 02 loading photos'] }),
    windows: 'NOT_RUN_ON_THIS_MAC', profile: '~/Library/Application Support/' + profile, publication: 'LOCAL_ONLY' });
run('/usr/bin/xattr', ['-cr', app]); run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const inventory = [];
async function walk(relative = '') {
    for (const entry of (await fs.readdir(path.join(app, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.posix.join(relative, entry.name), full = path.join(app, file), info = await fs.lstat(full), mode = info.mode & 0o7777;
        if (entry.isSymbolicLink()) { assert((await fs.realpath(full)).startsWith(app + '/')); inventory.push({ file, mode, link: await fs.readlink(full) }); }
        else if (entry.isDirectory()) await walk(file);
        else inventory.push({ file, bytes: info.size, mode, sha256: await sha(full) });
    }
}
await walk(); await save(path.join(out, 'app-inventory.json'), inventory);
await save(path.join(out, 'package-receipt.json'), { status: 'SIGNED_FROZEN_APP_PENDING_PACKAGED_NATIVE_REVIEW', app,
    executable: 'RA2 HD Editions', resources, sourceHead: head, sourceDigest, appInventorySha256: await sha(path.join(out, 'app-inventory.json')),
    target: 'darwin-arm64', files: inventory.length, selectedResourceFiles: plan.files.length + plan.campaignFiles.length,
    resourceFiles: plan.files.length + plan.campaignFiles.length, signing: 'AD_HOC_DEEP_STRICT_PASS_NOT_NOTARIZED',
    ...(completeCampaign ? { missions, profile, deliveryDate, userVisualAcceptance: hdMovies
        ? movieAcceptance ? 'MOVIES_USER_ACCEPTED_MENU_LOGO_REVIEW_PENDING' : 'COMPLETE_MOVIE_REVIEW_PENDING'
        : 'PENDING_CONSOLIDATED_REVIEW' } : {}),
    ...(acceptedMovieSelection ? { movieAcceptance: acceptedMovieSelection, movieFrameRates } : {}) });
console.log(JSON.stringify({ app, files: inventory.length, sourceDigest }));
