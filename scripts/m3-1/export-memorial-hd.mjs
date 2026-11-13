import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..');
const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const sovietMaster = option('--soviet-master');
const work = path.join(root, '.artifacts/m3-1/memorial');
const output = path.resolve(option('--output') ?? path.join(root, '.local/campaign/ra2/sov01t'));
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await read(path.join(work, 'source/source.json'));
const contract = await read(path.join(root, 'desktop/environment-urban-hd-contract.json'));
const family = contract.families['campaign-sov01-memorial'], revision = 'm3-1-memorial-hd-v1';
const bodyMaster = PNG.sync.read(await fs.readFile(path.join(work, 'body-master-r1.png')));
const flagMaster = PNG.sync.read(await fs.readFile(sovietMaster ?? path.join(work, 'flag-master-r1.png')));
const generatedBounds = [], artifacts = [];
const identify = async file => { const bytes = await fs.readFile(file); return { name: path.basename(file), bytes: bytes.length, sha256: sha(bytes) }; };
function bounds(image, cell) {
    let left = cell[0] + cell[2], top = cell[1] + cell[3], right = cell[0], bottom = cell[1];
    for (let y = cell[1]; y < cell[1] + cell[3]; y++) for (let x = cell[0]; x < cell[0] + cell[2]; x++) {
        if (image.data[(y * image.width + x) * 4 + 3] >= 240) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); }
    }
    assert(right > left && bottom > top); return [left, top, right - left, bottom - top];
}
function pixel(image, x, y) {
    x = Math.max(0, Math.min(image.width - 1, x)); y = Math.max(0, Math.min(image.height - 1, y));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1);
    const u = x - x0, v = y - y0;
    return [0,1,2].map(channel => Math.round(image.data[(y0 * image.width + x0) * 4 + channel] * (1-u) * (1-v)
        + image.data[(y0 * image.width + x1) * 4 + channel] * u * (1-v)
        + image.data[(y1 * image.width + x0) * 4 + channel] * (1-u) * v + image.data[(y1 * image.width + x1) * 4 + channel] * u * v));
}
function maskSample(mask, width, height, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y), u = x - x0, v = y - y0;
    const at = (x, y) => x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x];
    return at(x0,y0)*(1-u)*(1-v) + at(x0+1,y0)*u*(1-v) + at(x0,y0+1)*(1-u)*v + at(x0+1,y0+1)*u*v;
}
function rowBounds(mask, width, height) {
    return Array.from({ length: height }, (_, y) => {
        let left = width, right = -1;
        for (let x = 0; x < width; x++) if (mask[y * width + x]) { left = Math.min(left, x); right = x; }
        return right < left ? undefined : [left, right + 1];
    });
}
function fitLine(points) {
    assert(points.length >= 4);
    const n=points.length, sy=points.reduce((s,p)=>s+p[0],0), sx=points.reduce((s,p)=>s+p[1],0);
    const slope=(n*points.reduce((s,p)=>s+p[0]*p[1],0)-sy*sx)/(n*points.reduce((s,p)=>s+p[0]*p[0],0)-sy*sy);
    return { slope, intercept:(sx-slope*sy)/n };
}
function generatedRows(image, rect) {
    return Array.from({ length: rect[3] }, (_, y) => {
        let left=rect[2],right=-1;
        for(let x=0;x<rect[2];x++)if(image.data[((y+rect[1])*image.width+x+rect[0])*4+3]>=240){left=Math.min(left,x);right=x;}
        return right<left ? [0,rect[2]] : [left,right+1];
    });
}
// Both SHPs are consecutive pieces of one shaft. Fit their native coordinates
// together so the static and animated pieces meet without a stepped seam.
const polePoints = [];
for (const native of source.sources) {
    const frame = native.frames[0], index = await fs.readFile(path.join(work, 'source', frame.index));
    const rows = rowBounds(index, ...frame.trimSize);
    rows.forEach((row, y) => {
        if (row && row[1] - row[0] <= 3 && (native.member === 'cuwa19_a.shp' || y < 17)) {
            polePoints.push([frame.trimOrigin[1] + y + .5, frame.trimOrigin[0] + (row[0] + row[1]) / 2]);
        }
    });
}
const nativePole = fitLine(polePoints), poleWidth = 1.6;
function authoredPole(rows, flag) {
    const limit = flag ? rows.length * .85 : rows.length * .15;
    const points = rows.flatMap((row, y) => row && y > 8 && y < limit
        && (flag || row[1] - row[0] < 14) ? [[y + .5, row[0] + (flag ? 6 : (row[1] - row[0]) / 2)]] : []);
    return { ...fitLine(points), width: flag ? 12 : 6, end: flag ? rows.length : limit };
}
// Parameterize cloth across the shaft and between its top/bottom contours.
// Interpolated column bounds avoid the discontinuous per-row stretch that
// otherwise breaks the stripes and the metal shaft at native pixel boundaries.
function clothColumns(mask, width, height, pole, minDistance) {
    let maxDistance = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) maxDistance = Math.max(maxDistance, x + .5 - pole.intercept - pole.slope * (y + .5));
    }
    const columns = Array.from({ length: Math.ceil(maxDistance) + 1 }, () => [Infinity, -Infinity]);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const q = x + .5 - pole.intercept - pole.slope * (y + .5);
        if (mask[y * width + x] && q >= minDistance) {
            const column = columns[Math.round(q)];
            column[0] = Math.min(column[0], y); column[1] = Math.max(column[1], y + 1);
        }
    }
    const valid = columns.map((range, i) => range[1] > range[0] ? i : -1).filter(i => i >= 0);
    assert(valid.length);
    for (let i = 0; i < columns.length; i++) {
        if (columns[i][1] <= columns[i][0]) {
            const nearest = valid.reduce((a, b) => Math.abs(b-i) < Math.abs(a-i) ? b : a);
            columns[i] = [...columns[nearest]];
        }
    }
    const smooth = columns.map((_, i) => [0, 1].map(edge => {
        const window = columns.slice(Math.max(0, i-1), Math.min(columns.length, i+2));
        return window.reduce((sum, range) => sum + range[edge], 0) / window.length;
    }));
    return { maxDistance, at(q) {
        q = Math.max(0, Math.min(smooth.length - 1, q)); const lo = Math.floor(q), hi = Math.ceil(q), t = q-lo;
        return [0,1].map(edge => smooth[lo][edge]*(1-t)+smooth[hi][edge]*t);
    } };
}
async function materialFrame(info, member, density, insigniaOnly = false) {
    const [width,height] = info.trimSize, index = await fs.readFile(path.join(work, 'source', info.index));
    assert.equal(sha(index), info.indexSha256);
    const flag = member === 'cuwa19_a.shp', state = flag ? Math.floor(info.nativeFrame/16) : info.nativeFrame;
    const master = flag ? flagMaster : bodyMaster;
    const cell = flag ? [Math.floor(state*master.width/3),0,Math.floor((state+1)*master.width/3)-Math.floor(state*master.width/3),master.height]
        : [state%2*(master.width/2),Math.floor(state/2)*(master.height/2),master.width/2,master.height/2];
    const rect = bounds(master, cell), rows = rowBounds(index,width,height), artRows = generatedRows(master,rect);
    if(density===4 && (!flag || info.nativeFrame%16===0))generatedBounds.push({member,frame:info.nativeFrame,rect,native:[width,height],
        capacity:Math.min(rect[2]/width,rect[3]/height)});
    const pole = flag || state!==3 ? { slope: nativePole.slope,
        intercept: nativePole.intercept + nativePole.slope * info.trimOrigin[1] - info.trimOrigin[0],
        end: flag ? height : 17 } : undefined;
    const artPole = pole && authoredPole(artRows, flag);
    let nativeCloth, artCloth;
    if (flag) {
        nativeCloth = clothColumns(index, width, height, pole, 2);
        const artMask = Uint8Array.from({length: rect[2]*rect[3]}, (_, i) =>
            master.data[((Math.floor(i/rect[2])+rect[1])*master.width+i%rect[2]+rect[0])*4+3] >= 240 ? 1 : 0);
        artCloth = clothColumns(artMask, rect[2], rect[3], artPole, 9);
    }
    const coverage = Float32Array.from(index, value=>value?1:0);
    if(pole)for(let y=0;y<Math.min(height,pole.end);y++)for(let x=0;x<width;x++) {
        if(Math.abs(x+.5-(pole.intercept+pole.slope*(y+.5)))<2.1)coverage[y*width+x]=0;
    }
    const out = new PNG({width:info.legacyRenderSize[0]*density,height:info.legacyRenderSize[1]*density});
    for(let y=0;y<height*density;y++)for(let x=0;x<width*density;x++) {
        const nx=(x+.5)/density,ny=(y+.5)/density;
        let alpha=maskSample(coverage,width,height,nx-.5,ny-.5);
        const center=pole && pole.intercept+pole.slope*ny;
        const nearPole=pole && ny<pole.end && Math.abs(nx-center)<poleWidth/2+.4;
        if (nearPole && insigniaOnly) continue;
        if(nearPole) {
            let covered=0;
            for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
                const yy=(y+(sy+.5)/4)/density,xx=(x+(sx+.5)/4)/density;
                if(Math.abs(xx-(pole.intercept+pole.slope*yy))<=poleWidth/2)covered++;
            }
            alpha=Math.max(alpha,covered/16);
        }
        if(alpha<=0)continue;
        let ry=ny/height*rect[3]-.5, rx=nx/width*rect[2]-.5;
        if (flag) {
            const q = Math.max(2, nx-center), u = Math.min(1, q/nativeCloth.maxDistance);
            const [top,bottom] = nativeCloth.at(q), v = Math.max(0,Math.min(1,(ny-top)/Math.max(1,bottom-top)));
            const artQ = u*artCloth.maxDistance, [artTop,artBottom] = artCloth.at(artQ);
            ry = artTop+v*(artBottom-artTop); rx = artPole.intercept+artPole.slope*ry+artQ;
        }
        let rgb=pixel(master,rect[0]+rx,rect[1]+ry);
        if(nearPole) {
            const poleY = Math.max(12, Math.min(artPole.end-4, ny/pole.end*artPole.end));
            const poleX = artPole.intercept+artPole.slope*poleY+(nx-center)/poleWidth*artPole.width;
            rgb = pixel(master, rect[0]+poleX, rect[1]+poleY);
        }
        out.data.set([...rgb,Math.round(Math.min(1,alpha)*255)],(y*out.width+x)*4);
    }
    return out;
}
function pack(frames) {
    const candidates=[];
    for(let width=256;width<=2048;width+=64){
        if(frames.some(frame=>frame.width+4>width))continue;
        let x=2,y=2,row=0;const rects=[];
        for(const frame of frames){if(x+frame.width+2>width){x=2;y+=row+4;row=0;}rects.push([x,y,frame.width,frame.height]);x+=frame.width+4;row=Math.max(row,frame.height);}
        const height=y+row+2;if(height<=2048)candidates.push({width,height,rects,area:width*height});
    }
    assert(candidates.length);const best=candidates.sort((a,b)=>a.area-b.area)[0];
    const base=new PNG({width:best.width,height:best.height}),data=new PNG({width:best.width,height:best.height});
    for(let i=3;i<data.data.length;i+=4)data.data[i]=255;
    frames.forEach((frame,i)=>{const [x,y]=best.rects[i];for(let row=0;row<frame.height;row++)frame.data.copy(base.data,((y+row)*base.width+x)*4,row*frame.width*4,(row+1)*frame.width*4);});
    return {...best,base,data};
}
if (sovietMaster) {
    // Reuse the established cloth registration, inserting only generated gold
    // insignia. Existing cloth, shaft, alpha, other states and data stay exact.
    assert(option('--baseline') && option('--review') && option('--output'));
    const baseline = path.resolve(option('--baseline')), review = path.resolve(option('--review'));
    assert.notEqual(output, baseline); await fs.mkdir(review, { recursive: false });
    const manifest = await read(path.join(baseline, 'memorial-flag-hd.json'));
    const native = source.sources.find(s => s.member === 'cuwa19_a.shp');
    const receipt = { status: 'EXPORTED_SOVIET_INSIGNIA_NATIVE_REVIEW_PENDING', frames: [], artifacts: [],
        tool: 'Built-in imagegen', master: await identify(sovietMaster), sourceSha256: native.sha256,
        policy: 'Only generated yellow insignia is inserted into native slots 32-47. All alpha, registration, poles, other frames, data pages, body and original timing stay unchanged.' };
    const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
    const additions = [];
    for (const variant of manifest.variants) {
        assert.equal(variant.pages.length, 1);
        const page = variant.pages[0], bytes = await fs.readFile(path.join(baseline, page.base));
        assert.equal(sha(bytes), page.baseSha256);
        const atlas = PNG.sync.read(bytes);
        for (const frame of variant.frames.filter(f => f.nativeFrame >= 32)) {
            const generated = await materialFrame(native.frames[frame.nativeFrame], native.member, variant.density, true);
            const [left, top, width, height] = frame.sampleRect;
            assert.equal(generated.width, width); assert.equal(generated.height, height);
            let changed = 0;
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const input = (y * width + x) * 4, target = ((top + y) * atlas.width + left + x) * 4;
                const [red, green, blue] = generated.data.subarray(input, input + 3);
                const weight = smooth(((green - blue) / Math.max(1, red - blue) - .25) / .45)
                    * smooth((red - blue - 90) / 60) * smooth((green - blue - 60) / 50);
                if (weight < .001 || atlas.data[target + 3] === 0) continue;
                for (let c = 0; c < 3; c++) atlas.data[target + c] = Math.round(
                    atlas.data[target + c] * (1 - weight) + generated.data[input + c] * weight);
                changed++;
            }
            assert(changed > 8, `Missing Soviet insignia ${variant.density}X/${frame.nativeFrame}`);
            receipt.frames.push({ density: variant.density, nativeFrame: frame.nativeFrame, insigniaPixels: changed });
            const detail = new PNG({ width, height });
            for (let y = 0; y < height; y++) atlas.data.copy(detail.data, y * width * 4,
                ((top + y) * atlas.width + left) * 4, ((top + y) * atlas.width + left + width) * 4);
            await fs.writeFile(path.join(review, `flag-${variant.density}x-${frame.nativeFrame}.png`), PNG.sync.write(detail));
        }
        const name = `memorial-flag-r8-${variant.density}-p0-base.png`, encoded = PNG.sync.write(atlas);
        await fs.writeFile(path.join(output, name), encoded, { flag: 'wx' });
        page.base = name; page.baseSha256 = sha(encoded); page.baseBytes = encoded.length;
        additions.push({ name, bytes: encoded.length, sha256: sha(encoded), route: '/local-campaign/ra2/sov01t/' + name });
    }
    manifest.packRevision = 'm3-1-memorial-soviet-flag-r8';
    manifest.authored = { ...manifest.authored, sovietInsignia: { tool: receipt.tool, master: receipt.master,
        frames: [32, 47], method: 'Generated gold print follows the existing native cloth-column registration; unchanged baseline alpha and materials.' } };
    const name = 'memorial-flag-hd-r8.json', bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    await fs.writeFile(path.join(output, name), bytes, { flag: 'wx' });
    additions.push({ name, bytes: bytes.length, sha256: sha(bytes), route: '/local-campaign/ra2/sov01t/' + name });
    const bundle = await read(path.join(baseline, 'memorial-family.json'));
    bundle.revision = manifest.packRevision;
    Object.assign(bundle.members.find(m => m.member === native.member), { manifest: name, sha256: sha(bytes) });
    const bundleBytes = Buffer.from(JSON.stringify(bundle, null, 2) + '\n');
    await fs.writeFile(path.join(output, 'memorial-family.json'), bundleBytes);
    additions.push({ name: 'memorial-family.json', bytes: bundleBytes.length, sha256: sha(bundleBytes),
        route: '/local-campaign/ra2/sov01t/memorial-family.json' });
    const campaign = await read(path.join(output, 'manifest.json'));
    campaign.files = [...campaign.files.filter(f => !additions.some(a => a.name === f.name)), ...additions];
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(campaign, null, 2) + '\n');
    receipt.artifacts = additions; receipt.bundle = bundle;
    await fs.writeFile(path.join(review, 'export.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ status: receipt.status, modifiedFrames: receipt.frames.length, additions: additions.length }));
    process.exit(0);
}
const members=[];
for(const native of source.sources){
    const logical=native.frames.slice(0,native.bodyFrames).map(({nativeFrame,trimOrigin,trimSize,legacyRenderSize,empty})=>({nativeFrame,trimOrigin,trimSize,legacyRenderSize,empty}));
    const flag=native.member==='cuwa19_a.shp',label=flag?'flag':'body',variants=[];
    for(const density of [2,4]){
        const frames=await Promise.all(native.frames.slice(0,native.bodyFrames).map(info=>materialFrame(info,native.member,density)));
        const atlas=pack(frames),pages=[];
        const page={id:'p0',size:[atlas.width,atlas.height]};
        for(const role of ['base','data']){
            const name=`memorial-${label}-${density}-p0-${role}.png`,bytes=PNG.sync.write(atlas[role]);
            await fs.writeFile(path.join(output,name),bytes);artifacts.push({name,bytes:bytes.length,sha256:sha(bytes),route:'/local-campaign/ra2/sov01t/'+name});
            page[role]=name;page[role+'Sha256']=sha(bytes);page[role+'Bytes']=bytes.length;
        }
        pages.push(page);variants.push({density,pages,frames:logical.map((frame,i)=>({nativeFrame:i,page:'p0',sampleRect:atlas.rects[i],
            contentRect:[...atlas.rects[i].slice(0,2),...frame.trimSize.map(value=>value*density)]}))});
        const sample=PNG.sync.write(frames[0]);await fs.writeFile(path.join(work,`${label}-${density}x-frame0.png`),sample);
    }
    const manifest={schemaVersion:2,packId:'campaign-sov01-memorial',packRevision:revision,
        source:{member:native.member,sha256:native.sha256,theater:'URBAN',kind:'resolved-shp-member'},logical:{canvas:native.canvas,frames:logical},
        color:{representation:'authored-sRGB-RGBA8-plus-RGBA8-data'},variants,
        authored:{tool:'Built-in imagegen',master:await identify(path.join(work,flag?'flag-master-r1.png':'body-master-r1.png')),
            registration:'Exact native canvas, trim, slots and original separate shadows; source contour alpha with source-fitted slender pole',
            animation:flag?'All 48 native contours and cloth-column motion, with one continuous source-fitted shaft':'All four native states retain their individual authored material cell'}};
    const name=`memorial-${label}-hd.json`,bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.join(output,name),bytes);
    artifacts.push({name,bytes:bytes.length,sha256:sha(bytes),route:'/local-campaign/ra2/sov01t/'+name});members.push({member:native.member,manifest:name,sha256:sha(bytes)});
}
const bundle={schema:'campaign-environment-extension-v1',identity:'campaign-sov01-memorial',revision,familyHash:family.familyHash,members};
const name='memorial-family.json',bytes=Buffer.from(JSON.stringify(bundle,null,2)+'\n');await fs.writeFile(path.join(output,name),bytes);
artifacts.push({name,bytes:bytes.length,sha256:sha(bytes),route:'/local-campaign/ra2/sov01t/'+name});
const manifestFile=path.join(output,'manifest.json'),manifest=await read(manifestFile);
manifest.files=[...manifest.files.filter(file=>!artifacts.some(item=>item.name===file.name)),...artifacts];
await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(work,'export.json'),JSON.stringify({status:'EXPORTED_NATIVE_REGISTRATION_RUNTIME_AND_VISUAL_QA_PENDING',bundle,artifacts,generatedBounds,
    policy:'Task-owned additive campaign files. Original maps, state selection, animation timing, dimensions, shadows and canonical selectors remain unchanged.'},null,2)+'\n');
console.log(JSON.stringify({files:artifacts.length,generatedBounds,frameCounts:source.sources.map(s=>s.bodyFrames)}));
