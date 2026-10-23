import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import contract from './prepared-hd-contract.json' with { type: 'json' };
import { safeFile } from './profile.mjs';

export async function registerPreparedHdResources(root, selections, routes, record, pinned = contract) {
    if (!pinned.sha256) return;
    try {
        const file = await safeFile(root, pinned.indexPath ?? 'prepared-hd/index.json');
        const bytes = await fs.readFile(file);
        if (bytes.length > 4 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== pinned.sha256)
            throw Error('Prepared index identity mismatch');
        const index = JSON.parse(bytes);
        if (index.schemaVersion !== 1 || index.storage !== 'prepared-hd-pages-v1') throw Error('Prepared index schema');
        const pending = new Map(), bindings = [];
        for (const selection of selections.values()) for (const member of selection.members
            ?? (selection.sha256 && selection.files ? [selection] : [])) {
            const prepared = index.members[member.sha256];
            if (!prepared) continue;
            const densities = {};
            for (const [density, pages] of Object.entries(prepared)) {
                if (!['2', '4'].includes(density)) throw Error('Prepared density');
                densities[density] = {};
                for (const [id, page] of Object.entries(pages)) {
                    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !/^[a-f0-9]{64}$/.test(member.sha256)
                        || !/^[a-f0-9]{64}$/.test(page.sha256) || !Number.isSafeInteger(page.bytes)
                        || page.bytes < 1 || page.bytes > 64 * 1024 * 1024) throw Error('Prepared page identity');
                    const relative = `prepared-hd/${member.sha256}/${density}/${id}.bin`;
                    const payload = await safeFile(root, relative);
                    if ((await fs.stat(payload)).size !== page.bytes) throw Error('Prepared payload size');
                    const route = `/local-hd/prepared/${pinned.sha256}/${member.sha256}/${density}/${id}.bin`;
                    pending.set(route, payload);
                    densities[density][id] = { ...page, route };
                }
            }
            bindings.push({ member, densities });
        }
        // The acceleration layer is optional and publishes atomically. A bad
        // sidecar leaves the independently validated PNG paths available.
        for (const { member, densities } of bindings) member.prepared = densities;
        for (const [route, payload] of pending) routes.set(route, payload);
        record({ type: 'prepared-hd-registered', members: bindings.length, pages: pending.size, index: pinned.sha256 });
    } catch (error) { record({ type: 'prepared-hd-unavailable', reason: error.message }); }
}
