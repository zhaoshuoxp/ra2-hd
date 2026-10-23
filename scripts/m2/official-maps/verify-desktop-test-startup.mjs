// Launch the extracted user entry point and compare every listed title with the visible game catalog.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const [folderArgument, outputArgument] = process.argv.slice(2);
assert(folderArgument && outputArgument, 'Usage: verify-desktop-test-startup.mjs <extracted-folder> <new-output>');
const folder = path.resolve(folderArgument), output = path.resolve(outputArgument);
const revision = process.argv.find(arg => arg.startsWith('--revision='))?.slice(11) ?? 'R5';
assert(['R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16'].includes(revision));
const direct = process.argv.includes('--direct-app');
const manifest = JSON.parse(await fs.readFile(path.join(folder, `M2.3-${revision}-TEST-PACKAGE-MANIFEST.json`)));
const appName = path.basename(manifest.app);
const executable = path.join(folder, appName, 'Contents/MacOS/RA2 HD Editions');
const list = JSON.parse(await fs.readFile(path.join(folder, `M2.3-${revision}-Temperate-Map-Test-List.json`)));
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json'));
await fs.mkdir(output, { recursive: false });
const profile = path.join(folder, revision === 'R5' ? 'M2.3-R5-Test-Profile' : 'M2.3-Review-Profile');
const profileExists = !!(await fs.stat(profile).catch(() => undefined));
if (profileExists) {
    assert(process.argv.includes('--registration-only-retry'), 'Test the user launcher from a fresh extracted profile');
    assert.deepEqual(await fs.readdir(profile), ['resource-registration.json'], 'Retry only before any game preferences were created');
}
const report = { status: 'RUNNING', folder, revision, directApp: direct,
    userEntryPoint: direct ? executable : path.join(folder, `Launch-M2.3-${revision}-Test.command`),
    initiallyUnregistered: !profileExists, freshGamePreferences: true,
    registrationOnlyRetry: profileExists, cases: [], errors: [], userGameplayAcceptance: 'NOT_RECORDED' };
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let failure;
try {
    for (const edition of ['ra2', 'yr']) {
        const launchEnvironment = { ...process.env };
        for (const key of ['RA2_DESKTOP_USER_DATA', 'RA2_DESKTOP_NO_DISCOVERY', 'RA2_UI_RESOURCE_ROOT', 'ELECTRON_RUN_AS_NODE']) delete launchEnvironment[key];
        const app = await electron.launch({ executablePath: report.userEntryPoint, args: [], cwd: '/private/tmp',
            env: launchEnvironment, timeout: 60000 });
        try {
            const page = await app.firstWindow();
            page.on('pageerror', error => report.errors.push(error.stack));
            await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
            await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
            await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
            await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
            const chooseMap = await page.evaluate(() => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:ChooseMap'));
            await page.getByRole('button', { name: chooseMap, exact: true }).click();
            await page.locator('.map-sel-form').waitFor();
            const actual = await page.evaluate(() => {
                const screen = window.__ra2debug.mainMenuController.getCurrentScreen();
                return { maps: screen.allMaps.map(map => ({ member: map.mapName.toLowerCase(), title: map.mapTitle })),
                    selectedMode: screen.selectedGameMode.mapFilter,
                    visibleTitles: [...document.querySelectorAll('.map-list > .list-item')].map(row => row.textContent) };
            });
            assert.equal(actual.selectedMode, 'standard');
            const expected = list.maps.filter(row => row.edition === edition);
            for (const row of expected) {
                const map = actual.maps.find(map => map.member === row.member);
                assert(map, `Missing native map ${row.mapId}`);
                assert.equal(map.title, row.title, row.mapId);
                assert(actual.visibleTitles.includes(row.title), `Title absent from Standard UI: ${row.mapId}`);
            }
            const registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json')));
            assert.equal(registration.directory, path.join(folder, 'RA2-HD-Editions-Resources'));
            const runtime = await app.evaluate(({ app }) => ({ executable: app.getPath('exe'), profile: app.getPath('userData') }));
            assert.equal(runtime.profile, profile);
            assert.equal(runtime.executable, executable);
            await page.screenshot({ path: path.join(output, `${edition}-standard-map-catalog.png`) });
            report.cases.push({ edition, status: 'PASS_USER_LAUNCHER_REGISTERED_RESOURCES_AND_ALL_LISTED_TITLES',
                runtime, registration, listedMapCount: expected.length, nativeCatalogCount: actual.maps.length,
                visibleTitleCount: actual.visibleTitles.length, titles: expected.map(row => row.title) });
        } finally { await app.close(); }
        const trace = JSON.parse(await fs.readFile(path.join(profile, 'last-session.json')));
        const environment = trace.records.find(row => row.type === 'environment-registered');
        const terrain = trace.records.find(row => row.type === 'terrain-registered');
        const expectedEnvironment = JSON.parse(await fs.readFile(path.join(folder, 'RA2-HD-Editions-Resources/environment-selection.json')));
        const expectedTerrain = JSON.parse(await fs.readFile(path.join(folder, 'RA2-HD-Editions-Resources/terrain-selection.json')));
        assert.equal(environment?.revision, expectedEnvironment.revision);
        assert.equal(terrain?.revision, expectedTerrain.revision);
        assert(!trace.records.some(row => ['profile-unavailable', 'environment-original', 'terrain-original', 'renderer-gone'].includes(row.type)));
        Object.assign(report.cases.at(-1), { environment, terrain });
        await save();
    }
    assert.equal(report.errors.length, 0);
    report.status = 'PASS_EXTRACTED_USER_LAUNCHER_AND_ALL_61_VISIBLE_MAP_TITLES';
} catch (error) {
    failure = error;
    report.status = 'FAIL'; report.failure = error.stack;
}
await save();
if (failure) throw failure;
console.log(JSON.stringify({ output, status: report.status, cases: report.cases.map(row => ({ edition: row.edition, listedMapCount: row.listedMapCount })) }));
