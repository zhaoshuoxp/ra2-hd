import assert from 'node:assert/strict';
import {validateYrRoster} from './validate-roster.mjs';
// Legal prerequisite fixtures, native spy unlocks, production and combat.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const build = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const identity='ROSTER';
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({schemaVersion: 1, directory: path.resolve('.local')}));
const app = await electron.launch({
  executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: [build], cwd: '/private/tmp',
  env: {...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1'}, timeout: 60000,
});
const report = {
  status: 'FAIL',
  disclosure:
    'Controlled simultaneous roster placement and renderer/allocation validation. This is not native production or natural-match evidence.',
  errors: [],
  stages: [],
};
let page;
try {
  page = await app.firstWindow();
  page.on('pageerror', e => report.errors.push(e.stack));
  await page.locator('[data-edition=yr]').click({timeout: 60000});
  const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
  await page.getByRole('button', {name: locale['hd:menuskirmish'], exact: true}).waitFor({timeout: 90000});
  await page.evaluate(() => {
    window.__ra2debug.generalOptions.graphics.hdEnabled.value = true;
    window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p';
    const prefs = {_r_lastMap:'XMP23T4.map',_r_lastMode:'1',_r_lastCountry:'5',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',
      _r_hostOpts:'6;10000;10;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:2,c:5,co:2,s:3,t:1},null,null,null,null])};
    Object.entries(prefs).forEach(([k,v]) => localStorage.setItem(`_edition:yr:${k}`,v));
  });
  await page.getByRole('button', {name:locale['hd:menuskirmish'],exact:true}).click();
  await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
  await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
  await page.waitForFunction(() => window.__ra2debug?.game?.status === 1,undefined,{timeout:90000});
  await validateYrRoster(page, report, out);
  assert.equal(report.unitHd.bindings.length, 28);
  assert.deepEqual(report.errors, []);
  report.status = 'PASS_28_YR_SOVIET_ROOTS_AND_SHARED_ALLOCATION';
} catch (error) { report.failure=error.stack; process.exitCode=1; }
finally { await fs.writeFile(path.join(out,'result.json'), JSON.stringify(report,null,2)+'\n'); await app.close(); }
console.log(report.status);
