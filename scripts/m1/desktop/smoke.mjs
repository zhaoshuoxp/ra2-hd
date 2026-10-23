import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(`.artifacts/m1-5/smoke-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(output, 'profile') }, timeout: 60000 });
try {
    const page = await app.firstWindow(); const errors = [];
    page.on('pageerror', e => errors.push(e.stack));
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    const identity = await app.evaluate(({ app, BrowserWindow }) => ({ arch: process.arch, electron: process.versions.electron,
        packaged: app.isPackaged, appPath: app.getAppPath(), userData: app.getPath('userData'), cwd: process.cwd(),
        preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences() }));
    await page.getByText('Options', { exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(output, 'options.png') });
    const availability = await page.evaluate(() => fetch('/local-hd/availability.json').then(r => r.json()));
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ identity, errors, availability, text: await page.locator('body').innerText() }, null, 2));
    console.log(JSON.stringify({ output, availability, arch: identity.arch, errors }));
} finally { await app.close(); }
