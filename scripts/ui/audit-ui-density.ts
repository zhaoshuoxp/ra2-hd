// Source-only UI density audit. Decode each palette/state family without changing it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { PcxFile } from '../../src/data/PcxFile';
const out = '.artifacts/menu-ui/ui-originals';
mkdirSync(out, { recursive: true });
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(n => [n, readFileSync('.local/assets/ra2/' + n)])));
const inventory = JSON.parse(readFileSync('.artifacts/menu-ui/inventory-complete.json', 'utf8'));
const special = { 'sdbtnanm.shp':'sdbtnanm.pal', 'sdwrnanm.shp':'shell2.pal', 'sdbtnbkgd.shp':'shell2.pal',
    'mpascrnl.shp':'mpascrn.pal', 'mpsscrnl.shp':'mpsscrn.pal', 'pudlgbgn.shp':'dialog.pal',
    'mnbttn.shp':'mainbttn.pal', 'grfxtxt.shp':'grfxtxt.pal', 'glsl.shp':'gls.pal' };
const result: any[] = [];
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
for (const item of inventory.ui) {
    if (item.member === 'mouse.shp' || item.member.startsWith('ls800') || !item.archive) continue;
    if (item.member.endsWith('.pcx')) {
        const member = resolveMember(tree, item.member), pcx = new PcxFile(member.file);
        const key = item.member.replace('.pcx','');
        writeFileSync(out + '/' + key + '.rgba', pcx.data);
        result.push({ key, member:item.member, source:member.source, sha256:sha(member.file.getBytes()),
            width:pcx.width,height:pcx.height,frames:1,palette:'embedded',framesData:[{file:key+'.rgba',x:0,y:0,width:pcx.width,height:pcx.height}] });
    }
    if (!item.member.endsWith('.shp')) continue;
    for (const variant of item.variants) {
        const owner = tree.find(o => o.path === variant.archive)!;
        const file = owner.mix.openFile(item.member), shp = new ShpFile(file);
        const side = owner.path.includes('sidec01') ? 'allied' : owner.path.includes('sidec02') ? 'soviet' : 'menu';
        const paletteName = side === 'menu' ? special[item.member] ?? 'shell.pal' : 'sidebar.pal';
        const paletteFile = owner.mix.containsFile(paletteName) ? owner.mix.openFile(paletteName) : resolveMember(tree,paletteName).file;
        const palette = new Palette(paletteFile);
        const key = side + '-' + item.member.replace('.shp','');
        const framesData: any[] = [];
        for (let f = 0; f < shp.numImages; f++) {
            const frame = shp.getImage(f), rgba = new Uint8Array(shp.width * shp.height * 4);
            for (let y=0;y<frame.height;y++) for (let x=0;x<frame.width;x++) {
                const i=frame.imageData[y*frame.width+x], c=palette.colors[i];
                rgba.set([c.r,c.g,c.b,i?255:0],((frame.y+y)*shp.width+frame.x+x)*4);
            }
            const name=key+'-'+f+'.rgba'; writeFileSync(out+'/'+name,rgba);
            framesData.push({file:name,x:frame.x,y:frame.y,width:frame.width,height:frame.height});
        }
        result.push({key,member:item.member,source:owner.path,sha256:sha(file.getBytes()),palette:paletteName,
            paletteSha256:sha(paletteFile.getBytes()),width:shp.width,height:shp.height,frames:shp.numImages,framesData});
    }
}
writeFileSync(out+'/inventory.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({families:result.length,frames:result.reduce((n,x)=>n+x.frames,0)}));
