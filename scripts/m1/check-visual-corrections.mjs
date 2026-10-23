import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { installDisplayProbe } from './display-review-probe.mjs';

export async function checkVisualCorrections(page, output) {
    await fs.mkdir(output, { recursive: false });
    await page.evaluate(installDisplayProbe);
    const legacyShroud = JSON.parse(await fs.readFile('.artifacts/m1-4/followup-visual/diagnosis/result.json','utf8')).geometry;
    await page.evaluate(async legacyShroud => {
        const d=window.__ra2debug;
        const entries=[...d.worldView.powerPlantHd.overrides.entries()];
        const active=entries.find(([source])=>source.filename==='ggpowr_a.shp')?.[1];
        if(!active?.identity.endsWith('/stable-structure-effects-v1'))throw Error('Stabilized HD animation not active');
        const selection=await (await fetch('/local-hd/power-plant-selection.json')).json();
        const binding=selection.members.find(m=>m.member==='ggpowr_a.shp');
        const manifest=await (await fetch(`/local-hd/${binding.sha256}/manifest.json`)).json();
        const variant=manifest.variants.find(v=>v.density===d.powerPlantHd.density);
        const textures=[];
        for(let i=0;i<variant.pages.length;i++)for(const role of ['base','data']) {
            const spec=variant.pages[i];const response=await fetch(binding.files[spec[role]]);const bytes=await response.arrayBuffer();
            const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
            if(hash!==spec[role+'Sha256'])throw Error('Reference export hash mismatch');
            const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
            const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
            const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);image.close();
            textures.push({texture:active.pages[i][role],page:i,role,
                original:new Uint8Array(ctx.getImageData(0,0,canvas.width,canvas.height).data),fixed:active.pages[i][role].image.data});
        }
        let shroud;d.worldScene.scene.traverse(o=>{if(o.name==='map_shroud_layer')shroud=o.children[0];});
        const fixedShroud=shroud.material.map.image.data, originalShroud=new Uint8Array(fixedShroud.length);
        if(shroud.material.map.image.width!==legacyShroud.mapSize[0])throw Error('Shroud atlas dimensions changed');
        legacyShroud.sampleIndices.forEach((v,i)=>originalShroud[i*4+3]=v);
        const uv=shroud.geometry.attributes.uv, fixedUv=uv.array.slice(), originalUv=fixedUv.slice();
        const w=shroud.material.map.image.width,h=shroud.material.map.image.height;
        for(let base=0;base<originalUv.length;base+=16) {
            let l=1,r=0,b=1,t=0;
            for(let i=base;i<base+16;i+=2){l=Math.min(l,fixedUv[i]);r=Math.max(r,fixedUv[i]);b=Math.min(b,fixedUv[i+1]);t=Math.max(t,fixedUv[i+1]);}
            const ol=Math.round(l*w-0.5)/w,orr=Math.round(r*w+0.5)/w,ob=Math.round(b*h-0.5)/h,ot=Math.round(t*h+0.5)/h;
            for(let i=base;i<base+16;i+=2){originalUv[i]=ol+(fixedUv[i]-l)/(r-l)*(orr-ol);originalUv[i+1]=ob+(fixedUv[i+1]-b)/(t-b)*(ot-ob);}
        }
        const plant=d.renderableManager.getRenderableByGameObject(window.__m12Plant);
        const models=[plant.mainObj,...[...plant.animObjects.values()].flat()];
        const frames=models.filter(m=>m?.builder).map(m=>[m.builder,m.builder.getFrame()]);
        window.__m14Correction={active,textures,shroud,fixedShroud,originalShroud,fixedUv,originalUv,frames};
        d.unitSelection.deselectAll();d.gameScreen.pointer.unlock();d.gameScreen.gameAnimationLoop.stop();
    },legacyShroud);
    const report={status:'FAIL',shroud:[],animation:[],animationPixels:[]};
    async function save(capture,name) {
        await fs.writeFile(`${output}/${name}.png`,Buffer.from(capture.png.split(',')[1],'base64'));
        delete capture.png;return {...capture,file:name+'.png'};
    }
    try {
        const shroud = await page.evaluate(() => {
            const d=window.__ra2debug,s=window.__m14Correction,uv=s.shroud.geometry.attributes.uv;
            const rows=[], camera=d.worldScene.camera, saved=camera.position.clone();
            function mode(fixed,cover) {
                s.shroud.material.map.image.data=fixed?s.fixedShroud:s.originalShroud;s.shroud.material.map.needsUpdate=true;
                const src=fixed?s.fixedUv:s.originalUv;
                uv.array.set(src);
                if(cover)for(let i=0;i<uv.array.length;i+=16)uv.array.set(src.subarray(0,16),i);
                uv.needsUpdate=true;
            }
            for(const preset of ['original','720p','1080p','1440p','4k','native'])for(const shift of [0,0.25,10.5]) {
                camera.position.copy(saved);camera.position.x+=shift;camera.updateMatrixWorld(true);
                for(const fixed of [false,true]) {
                    mode(fixed,true);const c=window.__m14.capture(preset,preset==='4k'&&shift===0);
                    const gl=d.renderer.renderer.getContext(),v=c.draws.find(v=>v.defaultFramebuffer).viewport;
                    const pixels=new Uint8Array((v[2]-4)*(v[3]-4)*4);
                    gl.readPixels(v[0]+2,v[1]+2,v[2]-4,v[3]-4,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                    let bright=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>3)bright++;
                    rows.push({fixed,preset,shift,bright,buffer:c.buffer,logical:c.logical,glError:gl.getError(),png:c.png});
                }
            }
            camera.position.copy(saved);camera.updateMatrixWorld(true);
            mode(false,false);const before=window.__m14.capture('4k',true);
            mode(true,false);const after=window.__m14.capture('4k',true);
            return {rows,before,after};
        });
        for(const r of shroud.rows) {
            assert.equal(r.glError,0);if(r.fixed)assert.equal(r.bright,0,`Shroud leak: ${r.preset}/${r.shift}`);
            if(r.png)await save(r,`covered-${r.fixed?'fixed':'before'}`);else delete r.png;
        }
        assert(shroud.rows.some(r=>!r.fixed&&r.bright>0),'Reported shroud leak was not reproduced');
        report.shroud=shroud.rows;
        report.shroudNormal=[await save(shroud.before,'shroud-before'),await save(shroud.after,'shroud-fixed')];
        report.animationPixels=await page.evaluate(()=>{
            const s=window.__m14Correction,source=s.active;
            const state=[];
            for(const first of [0,8]) {
                const ref=source.frames[first],rect=ref.sampleRect;
                let oldLowerChanges=0,fixedLowerChanges=0,alphaChanges=0,remapChanges=0,lightChanges=0;
                for(let f=first;f<first+8;f++)for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++) {
                    const fr=source.frames[f],r=fr.sampleRect;
                    const p=s.textures.find(p=>p.page===fr.page&&p.role==='base'),q=s.textures.find(p=>p.page===ref.page&&p.role==='base');
                    const data=s.textures.find(p=>p.page===fr.page&&p.role==='data'),refData=s.textures.find(p=>p.page===ref.page&&p.role==='data');
                    const i=((r.y+y)*p.texture.image.width+r.x+x)*4,j=((rect.y+y)*q.texture.image.width+rect.x+x)*4;
                    const old=p.original.subarray(i,i+3).some((v,c)=>v!==q.original[j+c]);
                    const fixed=p.fixed.subarray(i,i+3).some((v,c)=>v!==q.fixed[j+c]);
                    if(y>=rect.height*0.52){if(old)oldLowerChanges++;if(fixed)fixedLowerChanges++;}else if(fixed)lightChanges++;
                    if(p.fixed[i+3]!==q.fixed[j+3])alphaChanges++;
                    if(data.fixed.subarray(i,i+4).some((v,c)=>v!==refData.fixed[j+c]))remapChanges++;
                }
                state.push({state:first?'damaged':'normal',oldLowerChanges,fixedLowerChanges,alphaChanges,remapChanges,lightChanges});
            }return state;
        });
        for(const r of report.animationPixels){assert(r.oldLowerChanges>0);assert(r.lightChanges>0);assert.equal(r.fixedLowerChanges,0);assert.equal(r.alphaChanges,0);assert.equal(r.remapChanges,0);}
        for(const state of ['normal','damaged'])for(let phase=0;phase<8;phase++) {
            const pair=await page.evaluate(({state,phase})=>{
                const d=window.__ra2debug,s=window.__m14Correction,p=d.renderableManager.getRenderableByGameObject(window.__m12Plant);
                const active=[...p.animObjects.values()].flat().find(m=>m.builder?.frameOffset===3);
                if(!active)throw Error('No active animation model');
                p.mainObj.builder.setFrame(state==='normal'?0:1);active.builder.setFrame((state==='normal'?0:8)+phase);
                const images=[];
                for(const fixed of [false,true]) {
                    for(const t of s.textures){t.texture.image.data=fixed?t.fixed:t.original;t.texture.needsUpdate=true;}
                    d.worldScene.meshBatchManager.updateMeshes();d.worldScene.meshBatchManager.processRenderQueue();d.worldScene.scene.updateMatrixWorld(true);
                    images.push(window.__m14.capture('4k',true));
                }
                return images;
            },{state,phase});
            for(const key of ['tick','camera','models','logical','hd','units'])assert.deepEqual(pair[0][key],pair[1][key]);
            assert(pair.every(c=>c.glError===0));
            report.animation.push({state,phase,cases:[await save(pair[0],`${state}-${phase}-before`),await save(pair[1],`${state}-${phase}-fixed`)]});
        }
        report.status='PASS_SHROUD_COVERAGE_AND_STABLE_ANIMATION_REVIEW_PENDING';
    } finally {
        await page.evaluate(()=>{
            const d=window.__ra2debug,s=window.__m14Correction;
            if(s){for(const [builder,frame] of s.frames)builder.setFrame(frame);
                for(const t of s.textures){t.texture.image.data=t.fixed;t.texture.needsUpdate=true;}
                s.shroud.material.map.image.data=s.fixedShroud;s.shroud.material.map.needsUpdate=true;
                s.shroud.geometry.attributes.uv.array.set(s.fixedUv);s.shroud.geometry.attributes.uv.needsUpdate=true;}
            d.gameScreen.gameAnimationLoop.start();delete window.__m14Correction;
        }).catch(()=>{});
        await fs.writeFile(`${output}/result.json`,JSON.stringify(report,null,2)+'\n');
    }
    return {status:report.status,output};
}
