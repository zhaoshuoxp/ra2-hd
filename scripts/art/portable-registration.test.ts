import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensurePortableRegistration } from '../../desktop/portable-registration.mjs';
import { bundledDirectory } from '../../desktop/bundled-layout.mjs';

test('first portable launch registers sibling resources and retains existing profile bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-buildup-portable-'));
    try {
        const appRoot = path.join(root, 'Test.app/Contents/Resources/app');
        const profile = bundledDirectory(appRoot, 'Review-Profile', 'darwin');
        const resources = bundledDirectory(appRoot, 'RA2-HD-Editions-Resources', 'darwin');
        await ensurePortableRegistration(profile, resources);
        const file = path.join(profile, 'resource-registration.json');
        expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ schemaVersion: 1, directory: resources });
        const bytes = await fs.readFile(file), before = await fs.stat(file);
        await ensurePortableRegistration(profile, path.join(root, 'another-resource-root'));
        expect(await fs.readFile(file)).toEqual(bytes);
        expect((await fs.stat(file)).mtimeMs).toBe(before.mtimeMs);
        const windows = 'D:\\Review\\resources\\app';
        expect(bundledDirectory(windows, 'Review-Profile', 'win32')).toBe('D:\\Review\\Review-Profile');
        expect(bundledDirectory(windows, 'RA2-HD-Editions-Resources', 'win32'))
            .toBe('D:\\Review\\RA2-HD-Editions-Resources');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});
