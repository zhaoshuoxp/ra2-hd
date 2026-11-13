import assert from 'node:assert/strict';
import { vectorPaths } from '../art/palette-contours.mjs';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..'), work = path.join(root, '.artifacts/m3-1/interface-hd');
const output = path.join(root, '.local/campaign/ra2/sov01t');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = await read(path.join(output, 'presentation.json'));
const files = [];
async function emit(name, bytes) {
    await fs.writeFile(path.join(output, name), bytes);
    const entry = { name, bytes: bytes.length, sha256: sha(bytes), route: '/local-campaign/ra2/sov01t/' + name };
    files.push(entry); return entry;
}
function resized(image, width, height) {
    const out = new PNG({ width, height });
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const sx = (x+.5)*image.width/width-.5, sy = (y+.5)*image.height/height-.5;
        const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(image.width-1, x0+1);
        const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(image.height-1, y0+1);
        const u = Math.max(0,sx-x0), v = Math.max(0,sy-y0);
        for (let c = 0; c < 4; c++) out.data[(y*width+x)*4+c] = Math.round(
            image.data[(y0*image.width+x0)*4+c]*(1-u)*(1-v)+image.data[(y0*image.width+x1)*4+c]*u*(1-v)
            +image.data[(y1*image.width+x0)*4+c]*(1-u)*v+image.data[(y1*image.width+x1)*4+c]*u*v);
    }
    return out;
}
const masterBytes = await fs.readFile(path.join(work, 'masters/menu-r2.png')), master=PNG.sync.read(masterBytes);
assert(master.width>=1264&&master.height>=1136);
const menu=await emit('interface-selection-2x.png',PNG.sync.write(resized(master,1264,1136)));
const arrows={};
for(const faction of ['allied','tutorial','soviet']) {
    arrows[faction]=[];
    for(let frame=0;frame<8;frame++) {
        const image=PNG.sync.read(await fs.readFile(path.join(work,'source',`${faction}-foreground-${frame}.png`)));
        arrows[faction].push(vectorPaths(image));
    }
}
const mission=PNG.sync.read(await fs.readFile(path.join(work,'source/mission-0.png')));
const photos=[[252,378,79,64],[349,378,79,64],[443,377,80,65],[542,266,238,242]];
const logoRect=[28,300,207,199];
const inside=(x,y,[left,top,width,height])=>x>=left&&y>=top&&x<left+width&&y<top+height;
const excluded=(x,y)=>x<6||y<6||x>=794||y>=514||photos.some(rect=>inside(x,y,rect))||inside(x,y,logoRect);
const vectors=vectorPaths(mission,excluded);
const emblemBytes=await fs.readFile(path.join(work,'masters/loading-emblem-r1.png')), emblem=PNG.sync.read(emblemBytes);
const emblemExport=PNG.sync.write(resized(emblem,420,400));
const authoredPhotos=[], photoElements=[];
for(const [index,name] of ['portrait','statue','tank','pentagon'].entries()){
    const bytes=await fs.readFile(path.join(work,'photo-masters',`${name}-r1.png`)),image=PNG.sync.read(bytes);
    const [x,y,width,height]=photos[index],encoded=PNG.sync.write(resized(image,width*2,height*2));
    authoredPhotos.push({name,rect:photos[index],master:{width:image.width,height:image.height,sha256:sha(bytes)},density:2});
    photoElements.push(`<image x="${x}" y="${y}" width="${width}" height="${height}" ${name==='pentagon'?'clip-path="url(#pentagon-photo)" ':''}href="data:image/png;base64,${encoded.toString('base64')}"/>`);
}
const originalLayer=`<image width="800" height="520" href="data:image/png;base64,${PNG.sync.write(mission).toString('base64')}"/>`;
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040" viewBox="0 0 800 520"><rect width="800" height="520" fill="#000"/>'
    +originalLayer+`<rect x="28" y="300" width="207" height="199" fill="#000"/><path d="M73 300V499M28 337H235" stroke="#460000" stroke-width=".7"/>`
    +vectors.map(p=>`<path fill="${p.fill}" fill-rule="evenodd" d="${p.d}"/>`).join('')
    +'<defs><clipPath id="pentagon-photo"><path d="M637 266H780V508H542V342H637Z"/></clipPath></defs>'+photoElements.join('')
    +'<rect x="347" y="54" width="287" height="286" fill="none" stroke="#ff5900" stroke-width="4"/>'
    +'<path d="M347 54L247 144V177L347 340M247 144H281V177H247" fill="none" stroke="#ff5900" stroke-width="1.7"/>'
    +`<image x="25" y="299" width="210" height="200" href="data:image/png;base64,${emblemExport.toString('base64')}"/>`
    +'<rect x="2" y="2" width="796" height="516" rx="3" fill="none" stroke="#24282c" stroke-width="4"/><rect x="1.5" y="1.5" width="797" height="517" rx="3" fill="none" stroke="#b4b9c2" stroke-width="1.3"/>'+'</svg>');
const loading=await emit('interface-loading-vector.svg',svg);
const chrome={};
for(const name of ['title','progressHousing','progressFill'])chrome[name]=[[]];
const bundle={schema:'campaign-interface-hd-v1',revision:'m3-1-interface-hd-v1',edition:'ra2',mission:'sov01t.map',
    originalPresentationSha256:sha(await fs.readFile(path.join(output,'presentation.json'))),density:2,
    selection:{file:menu.name,width:1264,height:1136,logical:[632,568],tool:'Built-in imagegen',master:{width:master.width,height:master.height,sha256:sha(masterBytes)}},
    loading:{file:loading.name,width:1600,height:1040,logical:[800,520],method:'Source-backed palette contours, authored emblem and four repainted photo slots, straight vector frames',
        emblemMaster:{width:emblem.width,height:emblem.height,sha256:sha(emblemBytes)},vectorPaths:vectors.length,originalPhotoRects:photos,authoredPhotos},arrows,chrome,
    animation:original.animation,anchors:original.anchors,
    policy:'2X active UI surfaces with resolution-independent arrows/chrome, authored emblem and four photo slots; shared 16 MiB UI budget. Original source art remains the complete fallback.'};
await emit('interface-hd.json',Buffer.from(JSON.stringify(bundle)+'\n'));
const file=path.join(output,'manifest.json'),manifest=await read(file);
await fs.copyFile(file,path.join(work,'campaign-manifest-before-interface.json'),constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
manifest.files=[...manifest.files.filter(entry=>!files.some(next=>next.name===entry.name)),...files];
await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(work,'export.json'),JSON.stringify({status:'EXPORTED_RUNTIME_QA_PENDING',files,master:bundle.selection.master,photos,vectorPaths:vectors.length,
    generationFailures:['Full loading repaint rejected twice by built-in imagegen output safety check. The emblem and four separate photo slots were then authored; no CLI/API was used.'],
    approvedPreviousVersion:'User accepted 247f6df7 memorial/roads/rank review before requesting interface HD and a bridge audit.'},null,2)+'\n');
console.log(JSON.stringify({files:files.map(({name,bytes})=>({name,bytes})),vectorPaths:vectors.length}));
