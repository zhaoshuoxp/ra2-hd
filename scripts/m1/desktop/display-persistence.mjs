import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2]));
const output = path.resolve(`.artifacts/m1-5/display-persistence-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const options = { executablePath: artifact.executable, cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(output, 'profile') }, timeout: 60000 };
const result = { status: 'FAIL', launches: [] };
for (let i = 0; i < 2; i++) {
    const app = await electron.launch(options);
    try {
        const page = await app.firstWindow();
        await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
        if (!i) {
            await page.evaluate(() => window.desktopDisplay.set('2560x1440'));
            const invalid = await page.evaluate(() => window.desktopDisplay.set('../bad').then(() => false, () => true));
            assert(invalid);
        }
        const state = await page.evaluate(() => window.desktopDisplay.get());
        result.launches.push(state);
        assert.equal(state.id, '2560x1440');
        if (i) {
            await page.keyboard.press('Alt+f'); await page.waitForTimeout(1000);
            assert.equal((await page.evaluate(() => window.desktopDisplay.get())).id, 'fullscreen');
            await page.keyboard.press('Alt+f'); await page.waitForTimeout(1000);
            assert.equal((await page.evaluate(() => window.desktopDisplay.get())).fullscreen, false);
        }
    } finally { await app.close(); }
}
result.status = 'PASS';
await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(output);
