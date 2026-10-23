import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHandler } from '../../desktop/protocol.mjs';
test('allowlisted menu video supports bounded byte ranges and rejects invalid requests', async () => {
    const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'ra2-video-test-')));
    try {
        const file=path.join(root,'menu.webm');await fs.writeFile(file,new Uint8Array([1,2,3,4,5]));
        const handler=createHandler({appRoot:root,appFiles:new Set(),getProfile:()=>({root,routes:new Map([['/local-ui/test/menu.webm',file]])}),getError:()=>''});
        const get=range=>handler(new Request('ra2://game/local-ui/test/menu.webm',{headers:range?{range}:{}}));
        const full=await get();expect(full.headers.get('content-type')).toBe('video/webm');expect(full.status).toBe(200);
        const middle=await get('bytes=1-3');expect(middle.status).toBe(206);
        expect(middle.headers.get('content-range')).toBe('bytes 1-3/5');expect([...new Uint8Array(await middle.arrayBuffer())]).toEqual([2,3,4]);
        const tail=await get('bytes=-2');expect([...new Uint8Array(await tail.arrayBuffer())]).toEqual([4,5]);
        for(const range of ['bytes=9-','bytes=4-2','bytes=0-1,3-4','invalid']) expect((await get(range)).status).toBe(416);
    } finally { await fs.rm(root,{recursive:true,force:true}); }
});
