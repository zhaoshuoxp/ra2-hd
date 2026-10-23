import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { validateGuardScan } from '../../editions/native-guard-scan.mjs';
import { validateUnitHd } from '../../editions/native-unit-hd.mjs';
import {validateYrRoster} from './validate-roster.mjs';
import { validateLightingScore } from '../../editions/native-lighting-score.mjs';
import { validateCombatFeedback } from '../../editions/native-combat-feedback.mjs';

const folder = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const lightingScore=process.argv.includes('--lighting-score');
const snow = process.argv.includes('--snow') || lightingScore;
await fs.mkdir(out, { recursive: false });
const executablePath = path.join(folder, 'RA2 HD YR Soviet Units R1.app/Contents/MacOS/RA2 HD Editions');
const report = { status: 'RUNNING', cases: [], errors: [] };
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
try {
    for (const edition of ['ra2', 'yr']) {
        const profile = path.join(out, `profile-${edition}`);
        const app = await electron.launch({ executablePath, cwd: '/private/tmp', args: [],
            env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '0' } });
        try {
            const identity = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, name: app.getName(), profile: app.getPath('userData') }));
            assert.equal(identity.packaged, true);
            assert.equal(identity.name, 'RA2 HD YR Soviet Units R1');
            assert.equal(identity.profile, profile);
            const page = await app.firstWindow();
            page.on('pageerror', e => report.errors.push(e.stack));
            await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
            await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
            const registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8'));
            assert.equal(registration.directory, path.join(folder, 'RA2-HD-Editions-Resources'));
            await page.evaluate(({edition,snow,lightingScore}) => {
                const map=lightingScore?'MP26S6.map':snow?'MP12S4.map':'MP23T4.map';
                const prefs = { _r_lastMap: edition === 'yr' ? `X${map}` : map, _r_lastMode: '1',
                    _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: lightingScore?'3':'0', _r_lastTeam: '0',
                    _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0',
                    _r_lastBots: JSON.stringify(lightingScore ? [null,{d:2,c:5,co:2,s:1,t:1},null,null,null,null,null,null] : [null, null, null, { d: 2, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
                for (const [key, value] of Object.entries(prefs)) localStorage.setItem(`_edition:${edition}:${key}`, value);
            }, {edition,snow,lightingScore});
            await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
            await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
            await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
            const country = await page.evaluate(() => window.__ra2debug.localPlayer.country.name);
            assert.equal(country, 'Africans');
            await page.evaluate(() => {
                const d = window.__ra2debug;
                const mcv = d.localPlayer.getOwnedObjects().find(u => d.game.rules.general.baseUnit.includes(u.name));
                d.actionsApi.orderUnits([mcv.id], 10);
            });
            await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.rules.constructionYard && u.buildStatus === 1));
            await page.screenshot({ path: path.join(out, `${edition}-packaged-match.png`) });
            const theater=await page.evaluate(()=>window.__ra2debug.theater.type);
            assert.equal(theater,snow?4:1);
            const check = { edition, country, theater, identity, autoDiscoveredResources: true, deployed: true };
            report.cases.push(check);
            const availability = await page.evaluate(() => window.__ra2debug.gameScreen.generalOptions.graphics.hdAvailability);
            const buildings = ['NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP', 'NACNST', 'NARADR', 'NADEPT', 'NAYARD',
                'NATECH', 'NANRCT', 'NALASR', 'NAFLAK', 'TESLA', 'NAIRON', 'NAMISL', 'NAWALL',
                ...(edition === 'ra2' ? ['NACLON', 'NAPSIS'] : ['NAINDP', 'NABNKR'])];
            for (const id of buildings) assert(availability[id.toLowerCase()]?.startsWith('HD active'), id);
            check.buildingHd = Object.fromEntries(buildings.map(id => [id, availability[id.toLowerCase()]]));
            const caseOut = path.join(out, edition); await fs.mkdir(caseOut);
            await validateGuardScan(page, check, caseOut);
            if (edition === 'yr') await validateYrRoster(page, check, caseOut);
            else await validateUnitHd(page, check, caseOut);
            if (edition === 'ra2') {
                const families = await page.evaluate(() => window.__ra2debug.sovietUnitsHd.families);
                for (const id of ['BORIS','SCHP','CCOMAND','PTROOP']) assert.equal(families[id], undefined);
            }
            await validateCombatFeedback(page, check, caseOut);
            if(lightingScore)await validateLightingScore(page,check,caseOut);
        } finally { await app.close(); }
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_PACKAGED_YR_ROSTER_AND_RA2_REGRESSION';
} catch (e) { report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1; }
await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
console.log(report.status);
