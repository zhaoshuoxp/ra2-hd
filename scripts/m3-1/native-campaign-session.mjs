import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

export async function campaignLaunchOptions(receipt, profile) {
    const runtime = receipt.runtime ?? receipt.build;
    if (runtime) {
        assert(receipt.resources && receipt.campaign, 'Live main checks require explicit resource roots');
        await fs.mkdir(profile, { recursive: true });
        await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({
            schemaVersion: 1, directory: receipt.resources,
        }));
    }
    return {
        executablePath: runtime
            ? await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'))
            : path.join(receipt.app, 'Contents/MacOS', receipt.executable),
        args: runtime ? [runtime] : [], cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))),
            RA2_DESKTOP_USER_DATA: profile, ...(runtime ? { RA2_DESKTOP_NO_DISCOVERY: '1',
                RA2_CAMPAIGN_RESOURCE_ROOT: receipt.campaign, RA2_CAMPAIGN_FROZEN_TERRAIN: '0' } : {}) },
    };
}

export async function enterCampaignFromMain(page, receipt) {
    if (!receipt.runtime && !receipt.build) return;
    await page.locator('[data-edition=ra2]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = JSON.parse(await fs.readFile(path.join(root, 'public/res/locale', language + '.json')));
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
}
