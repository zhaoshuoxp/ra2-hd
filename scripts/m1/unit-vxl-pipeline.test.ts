import { resourceRoot } from '../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Engine } from '../../src/engine/Engine';
import { loadVxlFamily } from '../../src/engine/renderable/unitVxl/loadVxlFamily';
import { vxlUnitIdentities } from '../../desktop/hd-profile.mjs';
import { retailTree, resolveMember } from '../../src/offline/retail';

const local = test;
local('checked VXL reads overlap a blocked decoder with one page of lookahead and cancel without uploads', async () => {
    const prior = { fetch: globalThis.fetch, vfs: Engine.vfs };
    const entry = vxlUnitIdentities.V3, root = `${resourceRoot}/` + entry.path.replace('manifest.json', '');
    const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
    const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix']
        .map(name => [name, readFileSync(`${resourceRoot}/assets/ra2/` + name)])));
    let stopped = false, uploads = 0, jobs = 0, finish!: (value: any) => void, started!: () => void;
    const reads: string[] = [], preparing = new Promise<void>(resolve => { started = resolve; });
    try {
        Engine.vfs = { openFile: (name: string) => resolveMember(tree, name).file } as any;
        globalThis.fetch = (async (url: any) => {
            const file = String(url).split('/').at(-1)!;
            reads.push(file); return new Response(readFileSync(root + file));
        }) as any;
        const renderer = { capabilities: { maxTextureSize: 4096 }, initTexture: () => uploads++,
            getContext: () => ({ getError: () => 0 }) } as any;
        const preparer = { prepare: () => {
            jobs++; started(); return new Promise(resolve => { finish = resolve; });
        } } as any;
        const loading = loadVxlFamily('V3', 100_000_000, renderer, () => stopped, 4, preparer);
        await preparing;
        // Hashing and lookahead may run, but a third pair must not accumulate
        // while the worker still owns the first one.
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(new Set(reads)).toEqual(new Set(['manifest.json', ...manifest.parts.slice(0, 2)
            .flatMap((part: any) => [part.files.base.file, part.files.data.file])]));
        expect(jobs).toBe(1); expect(uploads).toBe(0);
        stopped = true; finish({});
        const result = await loading;
        expect(result.gpuBytes).toBe(0); expect(result.vxl).toBeUndefined();
        expect(result.attempts[0].reason).toBe('cancelled');
        expect(uploads).toBe(0);
    } finally { globalThis.fetch = prior.fetch; Engine.vfs = prior.vfs; }
});
