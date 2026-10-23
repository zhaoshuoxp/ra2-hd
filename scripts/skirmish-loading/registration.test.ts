import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { registerPreparedHdResources } from '../../desktop/prepared-hd.mjs';

test('prepared registration uses an immutable pinned index and leaves PNG/UI bindings intact on failure', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-prepared-registration-')));
    const memberHash = 'a'.repeat(64), payload = Buffer.from([1, 2, 3, 4]);
    const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    const page = { bytes: payload.length, sha256: sha(payload) };
    const index = Buffer.from(JSON.stringify({ schemaVersion: 1, storage: 'prepared-hd-pages-v1',
        members: { [memberHash]: { 2: { p0: page } } } }));
    const pinned = { sha256: sha(index), indexPath: `prepared-hd/indexes/${sha(index)}.json` };
    const pagePath = path.join(root, 'prepared-hd', memberHash, '2/p0.bin');
    await fs.mkdir(path.dirname(pagePath), { recursive: true });
    await fs.mkdir(path.dirname(path.join(root, pinned.indexPath)), { recursive: true });
    await fs.writeFile(pagePath, payload);
    await fs.writeFile(path.join(root, pinned.indexPath), index);
    try {
        for (const failure of [undefined, 'missing-page', 'bad-index']) {
            const member = { sha256: memberHash, files: { png: '/local-hd/original.png' } };
            const ui = { revision: 'accepted-e', assets: [] };
            const selections = new Map([['/local-hd/selection.json', member], ['/local-ui/selection.json', ui]]);
            const routes = new Map([['/local-hd/original.png', 'original.png'], ['/local-ui/accepted.png', 'accepted.png']]);
            const events: any[] = [];
            if (failure === 'missing-page') await fs.unlink(pagePath);
            if (failure === 'bad-index') await fs.writeFile(path.join(root, pinned.indexPath), '{}');
            await registerPreparedHdResources(root, selections, routes, (event: any) => events.push(event), pinned);
            expect(routes.get('/local-hd/original.png')).toBe('original.png');
            expect(routes.get('/local-ui/accepted.png')).toBe('accepted.png');
            expect(selections.get('/local-ui/selection.json')).toBe(ui);
            expect(events[0].type).toBe(failure ? 'prepared-hd-unavailable' : 'prepared-hd-registered');
            expect('prepared' in member).toBe(!failure);
            expect(routes.size).toBe(failure ? 2 : 3);
        }
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});
