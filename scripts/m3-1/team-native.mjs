import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2] || path.join(root, '.artifacts/m3-1/teams-' + Date.now()));
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve(root, '../ra2-hd/.local') }));
const report = { status: 'RUNNING', scope: 'Accelerated instruction verification; no normal-play victory evidence.', samples: [], errors: [], consoleErrors: [] };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, '.artifacts/m3-1/review-runtime')], cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1', RA2_CAMPAIGN_RESOURCE_ROOT: path.join(root, '.local/campaign') } });
    app.process().stdout?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    app.process().stderr?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    page = await app.firstWindow({ timeout: 30000 });
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    await page.locator('[data-edition=ra2]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), undefined, { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`), 'utf8'));
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared);
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic());
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setErrorState());
    for (let i = 0; i < 22; i++) {
        const sample = await page.evaluate(() => {
            const g = window.__ra2debug.game, c = g.campaign;
            for (let n = 0; n < 150 && !c.failure && !c.result; n++) g.update();
            return { tick: g.currentTick, failure: c.failure, inputLocked: c.inputLocked, result: c.result, houses: [...c.houses].map(([id, p]) => ({
                id, credits: p.credits, objects: p.getOwnedObjects(true).map(o => ({ id: o.id, name: o.name, tile: o.tile && [o.tile.rx, o.tile.ry],
                    health: o.healthTrait.health, spawned: o.isSpawned, destroyed: o.isDestroyed, stance: o.stance,
                    tasks: o.unitOrderTrait?.getTasks().map(task => ({ name: task.constructor.name, status: task.status })) })) })),
                teams: c.teams.snapshot(), trace: c.teams.trace.slice(-12), pending: c.pendingMedia,
                particleSystems: Object.fromEntries(g.rules.getIni().getSection('ParticleSystems')?.entries ?? []),
                particles: ['SmallGreySSys', 'BigGreySSys', 'SmallGreySmoke', 'LargeGreySmoke'].map(name => [name, Object.fromEntries(g.rules.getIni().getSection(name)?.entries ?? [])]),
                eva: Object.fromEntries(window.__ra2debug.gameScreen?.evaSpecs?.entries ?? []) };
        });
        report.samples.push(sample); await save(); console.log(JSON.stringify({ tick: sample.tick, failure: sample.failure, locked: sample.inputLocked, teams: sample.teams.instances.length }));
        if (sample.failure || sample.result) break;
    }
    await page.screenshot({ path: path.join(out, 'instruction-state.png') });
    report.status = report.samples.at(-1)?.failure || report.errors.length ? 'FAIL' : 'PASS_BOUNDED_INSTRUCTIONS';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
finally { await save(); await app?.close(); console.log(out); }
