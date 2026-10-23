import { test, expect } from 'bun:test';
import { mkdtemp, realpath, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { registerUiResources } from '../../desktop/ui-profile.mjs';
test('review selection requires review mode until promotion; corrupt manifest fails closed', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(),'ra2-ui-profile-')));
    try {
        await mkdir(join(root,'ui-packs','r1'),{recursive:true});
        const manifest = JSON.stringify({schemaVersion:1,revision:'r1',assets:[{id:'test.shp',file:'missing.png',sha256:'a'.repeat(64),width:240,height:192,logicalWidth:60,logicalHeight:48}]});
        await writeFile(join(root,'ui-packs/r1/manifest.json'),manifest);
        await writeFile(join(root,'ui-selection.json'),JSON.stringify({schemaVersion:1,revision:'r1',reviewOnly:true,sha256:createHash('sha256').update(manifest).digest('hex')}));
        expect((await registerUiResources(root)).selections.size).toBe(0);
        const review = await registerUiResources(root,{review:true});
        expect(review.selections.size).toBe(1); expect(review.routes.size).toBe(0);
        await writeFile(join(root,'ui-selection.json'),JSON.stringify({schemaVersion:1,revision:'r1',reviewOnly:false,sha256:createHash('sha256').update(manifest).digest('hex')}));
        expect((await registerUiResources(root)).selections.size).toBe(1);
        await writeFile(join(root,'ui-packs/r1/manifest.json'),'{}');
        expect((await registerUiResources(root,{review:true})).selections.size).toBe(0);
        expect((await registerUiResources(root)).selections.size).toBe(0);
    } finally { await rm(root,{recursive:true,force:true}); }
});
