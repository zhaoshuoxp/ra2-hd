import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(process.argv[2]);
const target = JSON.parse(await fs.readFile('.artifacts/m2-4/post-acceptance-r1/desktop-target.json'));
const app = await electron.launch({ executablePath: path.join(target.app, 'Contents/MacOS/RA2 HD Editions'),
    cwd: '/private/tmp', env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(root, 'profile') } });
const page = await app.firstWindow();
try {
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'),
        undefined, { timeout: 90000 });
    const before = await page.evaluate(() => ({ graphics: window.__ra2debug.generalOptions.graphics.serialize(),
        stored: Object.fromEntries(Object.entries(localStorage).filter(([k]) => /opts|lastMap|lastCountry/i.test(k))) }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.pushScreen(16));
    await page.waitForSelector('[data-hd-family=all] .select-value');
    before.uiLabel = await page.locator('[data-hd-family=all]').innerText();
    await page.screenshot({ path: path.join(root, 'copied-profile-options.png') });
    await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(before, null, 2) + '\n');
    console.log(JSON.stringify(before));
} finally { await app.close(); }
