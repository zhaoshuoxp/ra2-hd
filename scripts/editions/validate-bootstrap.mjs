import { validateTrainerFollowup } from '../offline-trainer/native-followup-r2.mjs';
import { validateTrainerLifecycle } from '../offline-trainer/native-lifecycle.mjs';
import { validateTrainer } from '../offline-trainer/native-trainer.mjs';
import { validateCombatFeedback } from './native-combat-feedback.mjs';
import { validateCivilianExit } from '../m1/building-coverage/native-civilian.mjs';
import { validateBuildingDisplay } from '../m1/building-coverage/native-display.mjs';
import { validateSustainedSovietYuri } from '../m1/building-coverage/native-sustained.mjs';
import { validateNewBuildingFunctions } from '../m1/building-coverage/native-functions.mjs';
import { validateSovietBuildingCoverage } from '../m1/building-coverage/native-coverage.mjs';
import { validatePacing } from './native-pacing.mjs';
import { validatePresentation } from './native-presentation.mjs';
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { validateEconomy } from './native-economy.mjs';
import { validateMechanics } from './native-mechanics.mjs';
import { validatePowers } from './native-powers.mjs';
import { validateAi } from './native-ai.mjs';
import { validateTraits } from './native-traits.mjs';
import { validateSupport } from './native-support.mjs';
import { validateBuildings } from './native-buildings.mjs';
import { validateNaval } from './native-naval.mjs';
import { enableAutoplay } from './native-autoplay.mjs';
import { validateBattle } from './native-battle.mjs';
import { validateAir } from './native-air.mjs';
import { validateFortress } from './native-fortress.mjs';
import { validateAiPowers } from './native-ai-powers.mjs';
import { validateNavalAi } from './native-naval-ai.mjs';
import { validateCloning } from './native-cloning.mjs';
import { validateGarrison } from './native-garrison.mjs';
import { validateVirus } from './native-virus.mjs';
import { validatePassengers } from './native-passengers.mjs';
import { validateLoadingAi } from './native-loading-ai.mjs';
import { validateMinerProduction } from './native-miner-production.mjs';
import { validateTechCatalog } from './native-tech-catalog.mjs';
import { validateTransitions } from './native-transitions.mjs';
import { validateTechBuildings } from './native-tech-buildings.mjs';
import { validateBridges } from './native-bridges.mjs';
import { validateTower } from './native-tower.mjs';
import { validateGuardScan } from './native-guard-scan.mjs';
import { validateUnitHd } from './native-unit-hd.mjs';
import { validateLightingScore } from './native-lighting-score.mjs';
import { validateMissilePose } from './native-missile-pose.mjs';
import { validateVisualFeedback } from './native-visual-feedback.mjs';
const build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const edition = process.argv[4] ?? 'yr';
const mapName = process.argv.find(a => a.startsWith('--map='))?.slice(6) ?? (edition === 'yr' ? 'XMP01T4.map' : 'MP01T4.map');
const enemySlot = process.argv.includes('--two-player') ? 1 : 3;
const startPos = Number(process.argv.find(a => a.startsWith('--start-pos='))?.split('=')[1] ?? 0);
const enemyCountry = Number(process.argv.find(a => a.startsWith('--enemy-country='))?.split('=')[1] ?? -1);
const enemyDifficulty = Number(process.argv.find(a => a.startsWith('--enemy-difficulty='))?.split('=')[1] ?? 4);
const country = Number(process.argv.find(a => a.startsWith('--country='))?.split('=')[1] ?? (edition === 'yr' ? 9 : 0));
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const report = { status: 'RUNNING', edition, errors: [], console: [] };
let app;
try {
    const packagedApp = process.argv.find(a => a.startsWith('--app='))?.slice(6);
    app = await electron.launch({ executablePath: packagedApp ? path.join(path.resolve(packagedApp), 'Contents/MacOS/RA2 HD Editions') : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), cwd: '/private/tmp', args: packagedApp ? [] : [build],
        env: { ...process.env, RA2_UI_REVIEW: '0', RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    const page = await app.firstWindow();
    page.on('pageerror', e => (report.errors.push(e.stack), console.error(e.stack)));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) report.console.push(m.text().slice(0, 600)); if (m.type() === 'error') console.error(m.text().slice(0, 600)); });
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(({ edition, mapName, yuriAi, country, enemyCountry, enemyDifficulty, enemySlot, startPos }) => {
        const bots = Array(8).fill(null);
        bots[enemySlot] = { d: enemyDifficulty, c: enemyCountry >= 0 ? enemyCountry : yuriAi ? 9 : 5, co: 2, s: enemySlot, t: 1 };
        const prefs = { _r_lastMap: mapName, _r_lastMode: '1', _r_lastCountry: String(country), _r_lastColor: '1', _r_lastStartPos: String(startPos), _r_lastTeam: '0',
            _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify(bots) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(`_edition:${edition}:${k}`, v));
    }, { edition, mapName, country, enemyCountry, enemyDifficulty, enemySlot, startPos, yuriAi: edition === 'yr' && ['--ai', '--battle', '--ai-powers', '--naval-ai'].some(flag => process.argv.includes(flag)) });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
    report.lobby = await page.evaluate(() => ({ countries: window.__ra2debug.skirmishLobby.rules?.getMultiplayerCountries?.().map(c => c.name),
        map: window.__ra2debug.skirmishLobby.gameOpts?.mapName }));
    assert.equal(report.lobby.map?.toLowerCase(), mapName.toLowerCase(), 'The requested original map must be selected without fallback');
    await page.screenshot({ path: path.join(out, 'lobby.png') });
    await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 || !!document.querySelector('.message-box'), undefined, { timeout: 90000 });
    if (!await page.evaluate(() => window.__ra2debug?.game?.status === 1)) throw new Error('Game startup returned a message instead of a match');
    report.game = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { country: d.localPlayer.country.name, units: d.localPlayer.getOwnedObjects().map(u => u.name), countries: d.game.rules.getMultiplayerCountries().map(c => c.name) };
    });
    assert.equal(report.game.countries.length, edition === 'yr' ? 10 : 9);
    assert.equal(report.game.country, report.game.countries[country]);
    report.presentation = await page.evaluate(() => {
        const d = window.__ra2debug, unit = d.localPlayer.getOwnedObjects().find(u => u.isUnit());
        const r = d.renderableManager.getRenderableByGameObject(unit), pip = r.pipOverlay;
        const finder = pip?.imageFinder;
        return { hd: d.gameScreen.generalOptions.graphics.hdAvailability,
            finder: finder && { conscript: finder.conscriptHd?.report, power: finder.powerPlantHd?.report,
                napowr: finder.napowrHd?.report, soviet: Object.fromEntries(Object.entries(finder.sovietBuildingsHd).map(([k,v]) => [k,v.report])), rhino: finder.rhinoHd?.report },
            pipKeys: pip && Object.keys(pip),
            pips: finder && [0,13,14,15,16,17,18,19,20].filter(i => i < finder.find('pips', false).numImages).map(i => { const f = finder.find('pips', false).getImage(i); return { frame: i, width: f.width, height: f.height,
                colors: [...new Set(f.imageData)].filter(Boolean).map(index => ({index, rgb: pip.palette.getColor(index)})) }; }) };
    });
    report.difficulty = await page.evaluate(() => window.__ra2debug.game.getCombatants().map(p => ({ name: p.name, isAi: p.isAi, difficulty: p.aiDifficulty, handicap: p.handicap })));
    assert.equal(report.difficulty.find(p => p.isAi).difficulty, enemyDifficulty);
    await page.screenshot({ path: path.join(out, 'starting-force.png') });
    await page.evaluate(edition => {
        const d = window.__ra2debug;
        d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u => d.game.rules.general.baseUnit.includes(u.name)).id], 10);
    }, edition);
    await page.waitForFunction(edition => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.rules.constructionYard), edition);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(out, 'construction-yard.png') });
    if (process.argv.includes('--trainer-followup')) await validateTrainerFollowup(page, app, report, out);
    if (process.argv.includes('--trainer')) await validateTrainer(page, app, report, out, { smoke: process.argv.includes('--trainer-smoke') });
    if (process.argv.includes('--soviet-building-hd')) await validateSovietBuildingCoverage(page, report, out);
    if (process.argv.includes('--building-display')) await validateBuildingDisplay(page, app, report, out);
    if (process.argv.includes('--building-functions')) await validateNewBuildingFunctions(page, report);
    if (process.argv.includes('--civilian-exit')) await validateCivilianExit(page, report);
    if (process.argv.includes('--combat-feedback')) await validateCombatFeedback(page, report, out);
    if (process.argv.includes('--guard-scan')) await validateGuardScan(page, report, out);
    if (process.argv.includes('--unit-hd')) await validateUnitHd(page, report, out);
    if (process.argv.includes('--presentation')) await validatePresentation(page, report, out);
    if (process.argv.includes('--tech-catalog')) await validateTechCatalog(page, report, edition);
    if (process.argv.includes('--economy')) await validateEconomy(page, report);
    if (process.argv.includes('--mechanics')) await validateMechanics(page, report);
    if (process.argv.includes('--powers')) await validatePowers(page, report);
    if (process.argv.includes('--ai')) await validateAi(page, report);
    if (process.argv.includes('--traits')) await validateTraits(page, report);
    if (process.argv.includes('--support')) await validateSupport(page, report);
    if (process.argv.includes('--buildings')) await validateBuildings(page, report);
    if (process.argv.includes('--naval')) await validateNaval(page, report);
    if (process.argv.includes('--autoplay')) await enableAutoplay(page, report);
    if (process.argv.includes('--sustained')) await validateSustainedSovietYuri(page, report, out);
    if (process.argv.includes('--pacing')) await validatePacing(page, report);
    if (process.argv.includes('--battle')) await validateBattle(page, report);
    if (process.argv.includes('--air')) await validateAir(page, report);
    if (process.argv.includes('--fortress')) await validateFortress(page, report);
    if (process.argv.includes('--ai-powers')) await validateAiPowers(page, report);
    if (process.argv.includes('--naval-ai')) await validateNavalAi(page, report);
    if (process.argv.includes('--cloning')) await validateCloning(page, report);
    if (process.argv.includes('--garrison')) await validateGarrison(page, report);
    if (process.argv.includes('--virus')) await validateVirus(page, report);
    if (process.argv.includes('--passengers')) await validatePassengers(page, report);
    if (process.argv.includes('--loading-ai')) await validateLoadingAi(page, report);
    if (process.argv.includes('--miner-production')) await validateMinerProduction(page, report);
    if (process.argv.includes('--transitions')) await validateTransitions(page, report);
    if (process.argv.includes('--tech-buildings')) await validateTechBuildings(page, report);
    if (process.argv.includes('--bridges')) await validateBridges(page, report);
    if (process.argv.includes('--tower')) await validateTower(page, report);
    if (process.argv.includes('--missile-pose')) await validateMissilePose(page, report, out);
    if (process.argv.includes('--visual-feedback')) await validateVisualFeedback(page, report, out);
    if (process.argv.includes('--lighting-score')) await validateLightingScore(page, report, out);
    if (process.argv.includes('--trainer-lifecycle')) await validateTrainerLifecycle(page, report, out);
    assert.deepEqual(report.errors, []);
    assert(!report.console.some(s => /onGameTick error|onGameEvent error|tick error|event error|initialization failed|onGameStart FAILED|Action process error|BuiltIn awareness update failed/.test(s)), 'No caught AI runtime errors');
    report.status = process.argv.some(a => /^--(trainer-followup|trainer|economy|mechanics|powers|ai|traits|support|buildings|naval|battle|air|fortress|ai-powers|naval-ai|virus|garrison|cloning|passengers|loading-ai|miner-production|tech-catalog|transitions|tech-buildings|bridges|tower|guard-scan|unit-hd|soviet-building-hd|sustained|building-functions|building-display|civilian-exit|combat-feedback|lighting-score|visual-feedback|missile-pose)$/.test(a)) ? 'PASS_NATIVE_SELECTED_CASES' : 'PASS_BOOTSTRAP_ONLY';
} catch (e) { report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1; console.error(e); }
finally {
    if (app) {
        try {
            const page = await app.firstWindow();
            report.productionMinerTrace = await page.evaluate(() => window.productionMiner?.samples);
            report.passengerTrace = await page.evaluate(() => {
                const f = window.passengers;
                if (!f) return;
                return { controlled: f.yuri?.mindControllerTrait.getTargets().map(u => ({ id: u.id, name: u.name })),
                    expected: f.controlTarget?.id, expectedOwner: f.controlTarget?.owner.name,
                    boarded: f.fort.transportTrait.units.map(u => u.name) };
            });
            report.mechanicsState = await page.evaluate(() => {
                const m = window.mechanics;
                if (!m) return;
                return Object.fromEntries(['magnet', 'tank', 'master', 'gun', 'robot', 'disc', 'chaos', 'victim', 'friend', 'bunkerTank', 'fort', 'passenger', 'fortTarget', 'chopper', 'boris', 'enemyPower', 'reactor'].filter(k => m[k]).map(k => {
                    const u = m[k];
                    return [k, { name: u.name, hp: u.healthTrait?.getHitPoints(), tile: [u.tile.rx, u.tile.ry], height: u.tileElevation,
                        target: u.attackTrait?.currentTarget?.obj?.id, attackState: u.attackTrait?.attackState,
                        tasks: u.unitOrderTrait?.getTasks().map(t => t.constructor.name), weapon: u.primaryWeapon?.name,
                        lift: u.magneticLiftTrait?.isActive(), destroyed: u.isDestroyed, zone: u.zone,
                        deployed: u.deployerTrait?.isDeployed(), animating: u.simpleDeployAnimating, movingDisabled: u.moveTrait?.isDisabled(),
                        orderCount: u.unitOrderTrait?.orders?.length, owner: u.owner?.name }];
                }));
            });
            report.garrisonState = await page.evaluate(() => {
                const f = window.garrison;
                if (!f) return;
                const b = f.building;
                return { fired: f.fired, tile: [b.tile.rx, b.tile.ry], primary: b.primaryWeapon?.name, target: b.attackTrait?.currentTarget?.obj?.name,
                    state: b.attackTrait?.attackState, disabled: b.attackTrait?.isDisabled(), weapons: [...(b.armedTrait?.garrisonWeapons?.values() ?? [])].map(w => ({ name: w.name, cooldown: w.getCooldownTicks() })),
                    occupants: b.garrisonTrait.units.map(u => u.name), targetTile: f.target && [f.target.tile.rx, f.target.tile.ry] };
            });
            report.drainTrace = await page.evaluate(() => window.drainTrace);
            report.aiPowerState = await page.evaluate(() => window.aiPowers && ({ fired: window.aiPowers.fired, lab: { hp: window.aiPowers.lab.healthTrait.getHitPoints(), tile: [window.aiPowers.lab.tile.rx, window.aiPowers.lab.tile.ry] }, powers: window.aiPowers.owner.superWeaponsTrait.getAll().map(s => ({ name: s.name, status: s.status })) }));
            await page.screenshot({ path: path.join(out, 'last-state.png') });
            report.lastText = (await page.locator('body').innerText()).slice(-3000);
        } catch {}
        await app.close();
    }
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
    console.log(report.status);
}
