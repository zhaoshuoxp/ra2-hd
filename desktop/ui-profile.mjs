import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { safeFile } from './profile.mjs';
const digest = b => createHash('sha256').update(b).digest('hex');
export async function registerUiResources(root, { review = false } = {}) {
    const routes = new Map(), selections = new Map();
    try {
        const pointer = JSON.parse(await fs.readFile(await safeFile(root, 'ui-selection.json'), 'utf8'));
        if (pointer.reviewOnly && !review) return { routes, selections };
        if (pointer.schemaVersion !== 1 || !/^[\w-]{1,64}$/.test(pointer.revision) || !/^[a-f0-9]{64}$/.test(pointer.sha256)) throw Error('Invalid UI selection');
        const dir = `ui-packs/${pointer.revision}`;
        const bytes = await fs.readFile(await safeFile(root, `${dir}/manifest.json`));
        if (bytes.length > 262144 || digest(bytes) !== pointer.sha256) throw Error('UI manifest identity mismatch');
        const manifest = JSON.parse(bytes);
        if (manifest.schemaVersion !== 1 || manifest.revision !== pointer.revision || !Array.isArray(manifest.assets) || manifest.assets.length > 512) throw Error('Invalid UI pack');
        const ids = new Set();
        for (const a of manifest.assets) {
            if (!/^[a-z0-9_.-]{1,80}$/.test(a.id) || ids.has(a.id) || !/^[\w-]+\.png$/.test(a.file)
                || !/^[a-f0-9]{64}$/.test(a.sha256)
                || ![a.width,a.height,a.logicalWidth,a.logicalHeight].every(n => Number.isInteger(n) && n > 0 && n <= 4096)
                || a.width*a.height*4 > 16*1024*1024) throw Error('Invalid UI member');
            ids.add(a.id);
            // Missing/corrupt per-cameo members fail at decode without disabling peers.
            try { routes.set(`/local-ui/${manifest.revision}/${a.file}`, await safeFile(root, `${dir}/${a.file}`)); } catch {}
        }
        if (manifest.menuVideo) {
            // Video is streamed separately; validate both modes as one immutable pair.
            for (const key of ['original', 'hd']) {
                const v = manifest.menuVideo[key];
                if (!v || !/^[\w-]+\.webm$/.test(v.file) || !/^[a-f0-9]{64}$/.test(v.sha256)
                    || ![v.width,v.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)
                    || v.width * 570 !== v.height * 632) throw Error('Invalid menu video');
                const file = await safeFile(root, `${dir}/${v.file}`);
                const stat = await fs.stat(file);
                if (stat.size > 64 * 1024 * 1024 || digest(await fs.readFile(file)) !== v.sha256) throw Error('Invalid menu video identity');
                routes.set(`/local-ui/${manifest.revision}/${v.file}`, file);
            }
        }
        selections.set('/local-ui/selection.json', manifest);
    } catch { routes.clear(); selections.clear(); /* Entire malformed selection falls back to Original. */ }
    return { routes, selections };
}
