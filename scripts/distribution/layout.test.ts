import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { distributionCandidates, discoverDistributionResources, registerDistributionResources } from '../../desktop/distribution-layout.mjs';

test('Mac and Windows use internal or shared resources and keep settings outside the application', () => {
    expect(distributionCandidates('/Applications/RA2 HD.app/Contents/Resources', '/Users/test/Library/Application Support/Red Alert 2 HD', 'darwin'))
        .toEqual(['/Applications/RA2 HD.app/Contents/Resources/GameResources',
            '/Users/test/Library/Application Support/Red Alert 2 HD/GameResources', '/Applications/GameResources']);
    expect(distributionCandidates('D:\\Games\\RA2 HD\\resources', 'C:\\Users\\test\\AppData\\Roaming\\Red Alert 2 HD', 'win32'))
        .toEqual(['D:\\Games\\RA2 HD\\resources\\GameResources',
            'C:\\Users\\test\\AppData\\Roaming\\Red Alert 2 HD\\GameResources', 'D:\\Games\\RA2 HD\\GameResources']);
});

test('moving the complete app refreshes only registration; a missing resource pack does not destroy it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-distribution-'));
    try {
        const profile = path.join(root, 'profile');
        await fs.mkdir(profile);
        await fs.writeFile(path.join(profile, 'settings.json'), 'keep my settings');
        for (const name of ['old', 'moved app']) {
            const resources = path.join(root, name, 'GameResources');
            await fs.mkdir(resources, { recursive: true });
            await fs.writeFile(path.join(resources, 'ra2-core-manifest.json'), '{}');
            await fs.writeFile(path.join(resources, 'ui-selection.json'), '{}');
            const selected = await discoverDistributionResources([path.join(root, 'missing'), resources]);
            await registerDistributionResources(profile, selected);
            expect(JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8')).directory)
                .toBe(await fs.realpath(resources));
        }
        const registered = await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8');
        await registerDistributionResources(profile, await discoverDistributionResources([path.join(root, 'missing')]));
        expect(await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8')).toBe(registered);
        expect(await fs.readFile(path.join(profile, 'settings.json'), 'utf8')).toBe('keep my settings');
        const broken = path.join(root, 'broken');
        await fs.mkdir(broken);
        await expect(discoverDistributionResources([broken])).rejects.toThrow();
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});
