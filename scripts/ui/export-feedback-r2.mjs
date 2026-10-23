// Apply bounded, source-registered repairs. Unrelated atlas pixels remain exact.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';

const work = path.resolve('.artifacts/presentation-r2-20261020');
const revision = process.argv.find(arg => arg.startsWith('--revision='))?.split('=')[1] ?? 'presentation-r2-20261020-v1';
const records = JSON.parse(await fs.readFile(path.join(work, 'source-parts.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const masters = {};
for (const [family, name] of [['GAWEAP', 'factory-vent-master.png'], ['GAREFN', 'refinery-end-master.png']]) {
    masters[family] = (await fs.readFile(path.join('art/presentation-r2-20261020', name))).toString('base64');
}
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/ui/feedback-art-shell.mjs')], cwd: '/private/tmp', timeout: 60000,
});
await fs.mkdir(path.join(work, revision), { recursive: false });
const receipt = { status: 'RUNNING', revision, members: [], restoredUnloadingMembers: [] };
try {
    const page = await app.firstWindow();
    for (const record of records) {
        const manifest = structuredClone(record.hd);
        const directory = path.resolve('.local/hd-packs', manifest.packId, revision);
        await fs.mkdir(directory, { recursive: false });
        const ledger = [];
        for (const variant of manifest.variants) for (const atlas of variant.pages) {
            const oldBase = await fs.readFile(path.join(record.root, atlas.base));
            const oldData = await fs.readFile(path.join(record.root, atlas.data));
            const result = await page.evaluate(async ({ record, variant, atlas, oldBase, oldData, master }) => {
                const decode = async value => createImageBitmap(new Blob([
                    Uint8Array.from(atob(value), c => c.charCodeAt(0)),
                ], { type: 'image/png' }));
                const [image, dataImage, source] = await Promise.all([decode(oldBase), decode(oldData), decode(master)]);
                const make = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
                const base = make(image.width, image.height), data = make(image.width, image.height);
                const ctx = base.getContext('2d'), dctx = data.getContext('2d');
                ctx.drawImage(image, 0, 0); dctx.drawImage(dataImage, 0, 0);
                const original = ctx.getImageData(0, 0, base.width, base.height);
                const originalData = dctx.getImageData(0, 0, base.width, base.height);
                const [cw, ch] = record.hd.logical.canvas;
                const normalized = make(cw * 4, ch * 4), nctx = normalized.getContext('2d');
                nctx.drawImage(source, 0, 0, normalized.width, normalized.height);
                const repaired = make(cw * 4, ch * 4), rctx = repaired.getContext('2d');
                const factory = record.family === 'GAWEAP';
                const rect = factory ? [75, 137, 118, 172] : [139, 100, 173, 144];
                if (factory) {
                    const sx = [75, 84.5, 94.73, 104.5, 118], tx = [75, 80.7, 90, 99.3, 118];
                    const sy = [137, 140.5, 145.35, 160, 172], ty = [137, 140.5, 145.25, 159, 172];
                    for (let x = 0; x < sx.length - 1; x++) for (let y = 0; y < sy.length - 1; y++) {
                        rctx.drawImage(normalized, sx[x] * 4, sy[y] * 4, (sx[x+1]-sx[x]) * 4, (sy[y+1]-sy[y]) * 4,
                            tx[x] * 4, ty[y] * 4, (tx[x+1]-tx[x]) * 4, (ty[y+1]-ty[y]) * 4);
                    }
                    rctx.save(); rctx.scale(4, 4);
                    const steel = rctx.createLinearGradient(0, 140.65, 0, 149.85);
                    steel.addColorStop(0, '#666b72'); steel.addColorStop(.4, '#dce0e4');
                    steel.addColorStop(.7, '#8f969f'); steel.addColorStop(1, '#44494e');
                    rctx.beginPath(); rctx.ellipse(90, 145.25, 9.2, 4.4, 0, 0, Math.PI*2);
                    rctx.fillStyle = steel; rctx.fill();
                    rctx.beginPath(); rctx.ellipse(90, 145.25, 8.4, 3.8, 0, 0, Math.PI*2);
                    rctx.fillStyle = '#111619'; rctx.fill(); rctx.restore();
                } else {
                    // Fit the complete authored end curve inside the native right boundary.
                    rctx.drawImage(normalized, 139*4, 100*4, 40*4, 44*4, 139*4, 100*4, 34*4, 44*4);
                }
                const touched = [], stats = [];
                for (const frame of variant.frames.filter(f => f.page === atlas.id && f.nativeFrame < 2)) {
                    const meta = record.hd.logical.frames[frame.nativeFrame], native = record.frames[frame.nativeFrame];
                    if (meta.empty || meta.trimSize[0] < 2) continue;
                    const [x, y, w, h] = frame.sampleRect, density = variant.density;
                    const left = Math.max(rect[0], meta.trimOrigin[0]), top = Math.max(rect[1], meta.trimOrigin[1]);
                    const right = Math.min(rect[2], meta.trimOrigin[0] + meta.trimSize[0]);
                    const bottom = Math.min(rect[3], meta.trimOrigin[1] + meta.trimSize[1]);
                    if (right <= left || bottom <= top) continue;
                    const target = [x + (left-meta.trimOrigin[0])*density, y + (top-meta.trimOrigin[1])*density,
                        (right-left)*density, (bottom-top)*density].map(Math.round);
                    const [px, py, pw, ph] = target;
                    const before = ctx.getImageData(px, py, pw, ph);
                    ctx.clearRect(px, py, pw, ph);
                    ctx.drawImage(repaired, left*4, top*4, (right-left)*4, (bottom-top)*4, px, py, pw, ph);
                    const patch = ctx.getImageData(px, py, pw, ph), remap = dctx.getImageData(px, py, pw, ph);
                    const previousRemap = new Uint8ClampedArray(remap.data);
                    const hull = [[83,137.8],[102,137.8],[112,145],[117,150],[118,164],[108,169],[85,170],[77.5,165],[77.5,146]];
                    const smooth = value => { const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t); };
                    const coverage = (x, y) => {
                        if (!factory) return smooth(Math.min((x-139)/1.5,(y-100)/1.5,(144-y)/1.2));
                        let inside=false,distance=Infinity;
                        for(let i=0,j=hull.length-1;i<hull.length;j=i++){
                            const a=hull[j],b=hull[i],dx=b[0]-a[0],dy=b[1]-a[1];
                            if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
                            const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
                            distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
                        }
                        return inside?smooth(distance/1.5):0;
                    };
                    for (let iy = 0; iy < ph; iy++) for (let ix = 0; ix < pw; ix++) {
                        const index = (iy*pw+ix)*4;
                        const weight=coverage(left+(ix+.5)/density,top+(iy+.5)/density);
                        const r = patch.data[index], g = patch.data[index+1], b = patch.data[index+2];
                        const owner = r > 32 && r > g*1.8 && r > b*1.6;
                        const ownerIndex=owner?Math.max(0,Math.min(15,Math.round((252-r)/220*15))):0;
                        const oldAlpha=before.data[index+3]/255,newAlpha=patch.data[index+3]/255;
                        const alpha=oldAlpha*(1-weight)+newAlpha*weight;
                        for(let c=0;c<3;c++)patch.data[index+c]=alpha?Math.round((before.data[index+c]*oldAlpha*(1-weight)+patch.data[index+c]*newAlpha*weight)/alpha):0;
                        patch.data[index+3]=factory?before.data[index+3]:Math.round(alpha*255);
                        const oldOwner=previousRemap[index]/255,newOwner=owner?1:0;
                        const ownerCoverage=oldOwner*(1-weight)+newOwner*weight;
                        remap.data[index]=Math.round(ownerCoverage*255);
                        remap.data[index+1]=ownerCoverage?Math.round((previousRemap[index+1]*oldOwner*(1-weight)+ownerIndex*newOwner*weight)/ownerCoverage):previousRemap[index+1];
                        remap.data[index+2]=previousRemap[index+2];remap.data[index+3]=previousRemap[index+3];
                        if(!weight)for(let c=0;c<4;c++){patch.data[index+c]=before.data[index+c];remap.data[index+c]=previousRemap[index+c];}
                        // Transparent damaged-pose cutouts cannot contain owner-color coverage.
                        if(!patch.data[index+3])remap.data[index]=0;
                    }
                    ctx.putImageData(patch, px, py); dctx.putImageData(remap, px, py);
                    touched.push(target); stats.push({ nativeFrame: frame.nativeFrame, rect: [left,top,right,bottom] });
                }
                const after = ctx.getImageData(0, 0, base.width, base.height);
                const afterData = dctx.getImageData(0, 0, base.width, base.height);
                let changed = 0, outside = 0;
                for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
                    const p = (y*base.width+x)*4;
                    const differs = [0,1,2,3].some(c => original.data[p+c] !== after.data[p+c] || originalData.data[p+c] !== afterData.data[p+c]);
                    if (!differs) continue;
                    changed++;
                    if (!touched.some(([tx,ty,tw,th]) => x>=tx && x<tx+tw && y>=ty && y<ty+th)) outside++;
                }
                const png = canvas => canvas.toDataURL('image/png').split(',')[1];
                const full = make(cw*variant.density,ch*variant.density), fctx = full.getContext('2d');
                const f = variant.frames.find(f => f.page===atlas.id && f.nativeFrame===0);
                if (f) {
                    const [x,y,w,h]=f.sampleRect, m=record.hd.logical.frames[0];
                    fctx.drawImage(base,x,y,w,h,m.trimOrigin[0]*variant.density,m.trimOrigin[1]*variant.density,w,h);
                }
                image.close(); dataImage.close(); source.close();
                return { base: png(base), data: png(data), preview: f ? png(full) : undefined, changed, outside, stats };
            }, { record, variant, atlas, oldBase: oldBase.toString('base64'), oldData: oldData.toString('base64'), master: masters[record.family] });
            assert.equal(result.outside, 0, 'Unrelated atlas pixels changed');
            for (const role of ['base', 'data']) {
                const bytes = Buffer.from(result[role], 'base64');
                await fs.writeFile(path.join(directory, atlas[role]), bytes);
                atlas[role+'Sha256'] = sha(bytes); atlas[role+'Bytes'] = bytes.length;
            }
            if (result.preview && variant.density===4) await fs.writeFile(path.join(work, revision, record.member.member+'-r2.png'), Buffer.from(result.preview,'base64'));
            ledger.push({ density: variant.density, page: atlas.id, changedPixels: result.changed, changedOutsideRepairRects: result.outside, frames: result.stats });
        }
        manifest.packRevision = revision;
        manifest.presentationR2 = { previousManifest: record.root+'/manifest.json',
            method: record.family==='GAWEAP' ? 'native-axis-registered-vent-housing-with-separate-retained-rotor' : 'complete-end-rim-fitted-inside-native-frame',
            unchangedLogicalCanvasTrimFramesAndShadows: true, ledger };
        const bytes = Buffer.from(JSON.stringify(manifest,null,2)+'\n');
        await fs.writeFile(path.join(directory,'manifest.json'),bytes);
        receipt.members.push({ key: record.key, member: record.member.member, packId: manifest.packId, revision, sha256: sha(bytes), ledger });
    }
    const file='desktop/allied-building-coverage.json', catalog=JSON.parse(await fs.readFile(file));
    for (const key of new Set(receipt.members.map(m=>m.key))) {
        const selected=catalog[key], previous='.local/'+selected.familyPath;
        const family=JSON.parse(await fs.readFile(previous));
        if (selected.family==='GAREFN') {
            const original=JSON.parse(await fs.readFile('.local/'+family.presentationRepair.originalFamily));
            for (const member of family.members.filter(m=>/refnl[123]\.shp$/.test(m.member))) {
                const source=original.members.find(m=>m.member===member.member);
                assert(source && source.revision!=='mechanical-layers-20261020-v1');
                Object.assign(member,source); receipt.restoredUnloadingMembers.push({key,...source});
            }
        }
        for (const repair of receipt.members.filter(m=>m.key===key)) {
            Object.assign(family.members.find(m=>m.member===repair.member),{revision,sha256:repair.sha256});
        }
        family.presentationR2={previousFamily:selected.familyPath,scope:'Only reopened vent housing/end cap and removal of rejected R1 unloading repaint'};
        const target=path.join(path.dirname(path.dirname(previous)),revision,'family.json');
        await fs.mkdir(path.dirname(target),{recursive:false});
        const bytes=Buffer.from(JSON.stringify(family,null,2)+'\n');await fs.writeFile(target,bytes);
        selected.familyPath=target.replace(/^\.local\//,'');selected.familyHash=sha(bytes);
    }
    await fs.writeFile(file,JSON.stringify(catalog,null,2)+'\n');
    receipt.status='PASS_BOUNDED_REGISTRATION_AND_CAP_EXPORT';
} catch (error) {
    receipt.status='FAIL';receipt.failure=error.stack;process.exitCode=1;
} finally {
    await app.close();await fs.writeFile(path.join(work,revision+'-export.json'),JSON.stringify(receipt,null,2)+'\n');
}
console.log(JSON.stringify({status:receipt.status,members:receipt.members.length,restoredUnloadingMembers:receipt.restoredUnloadingMembers.length}));
