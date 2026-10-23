import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Isolated display diagnostic. Reuses the unchanged rejected candidate for comparison only.
export async function runRhinoZoom(page, output) {
    await fs.mkdir(output, { recursive: false });
    const report = { status: 'FAIL', cases: [] };
    try {
        report.cases = await page.evaluate(() => {
            const d = window.__ra2debug, unit = window.__m13Unit;
            const r = d.renderableManager.getRenderableByGameObject(unit);
            const renderer = d.renderer.renderer, camera = d.worldScene.camera, gl = renderer.getContext();
            const meshes = r.vxlBuilders.map(b => [...b.sections.values()][0]);
            const savedZoom = camera.zoom, oldFacing = unit.turretTrait.facing;
            const rotations = [r.dirWrapObj, r.tiltObj, r.turret, r.barrel].map(o => [o,o.rotation.clone()]);
            if (savedZoom !== 1) throw Error('Expected original camera scale');
            d.unitSelection.deselectAll();
            unit.turretTrait.facing = 0; r.updateVxlRotation(0,true);
            const checksum = array => {
                const bytes = new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
                let value = 2166136261;
                for (const byte of bytes) value = Math.imul(value ^ byte,16777619);
                return (value >>> 0).toString(16);
            };
            const describe = mesh => {
                const geometry = mesh.geometry, bounds = [Infinity,Infinity,-Infinity,-Infinity];
                const viewport = d.worldScene.viewport;
                for (let i=0; i<geometry.attributes.position.count; i++) {
                    const p = r.getPosition().clone().fromBufferAttribute(geometry.attributes.position,i)
                        .applyMatrix4(mesh.matrixWorld).project(camera);
                    const x=viewport.x+(p.x+1)*viewport.width/2, y=viewport.y+(1-p.y)*viewport.height/2;
                    bounds[0]=Math.min(bounds[0],x); bounds[1]=Math.min(bounds[1],y);
                    bounds[2]=Math.max(bounds[2],x); bounds[3]=Math.max(bounds[3],y);
                }
                return { bounds, outputSize: [(bounds[2]-bounds[0])*2,(bounds[3]-bounds[1])*2],
                    geometryId: geometry.uuid, matrix: mesh.matrixWorld.toArray(),
                    attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([k,a]) =>
                        [k,{ count:a.count, itemSize:a.itemSize, checksum:checksum(a.array) }])),
                    index: { count:geometry.index.count, checksum:checksum(geometry.index.array) },
                    materialId: mesh.material.uuid, materialType:mesh.material.type,
                    palette:mesh.material.palette.uuid, light:mesh.material.extraLight.toArray(),
                    fragmentShader:mesh.material.fragmentShader, opacity:mesh.material.opacity,
                    depthWrite:mesh.material.depthWrite, shadow:mesh.castShadow };
            };
            function capture(variant, zoom, label) {
                camera.zoom=zoom; camera.updateProjectionMatrix();
                window.__m13Probe.setVariant(variant === 'original' ? 'A' : 'B');
                const draws=[], originalRender=renderer.render, originalShadowRender=renderer.shadowMap.render, methods=new Map();
                let inWorld=false, inShadow=false;
                renderer.shadowMap.render=function(...args) {
                    const previous=inShadow; inShadow=true;
                    try { return originalShadowRender.apply(this,args); }
                    finally { inShadow=previous; }
                };
                renderer.render=function(scene,...args) {
                    const previous=inWorld; inWorld=scene===d.worldScene.scene;
                    try { return originalRender.call(this,scene,...args); }
                    finally { inWorld=previous; }
                };
                for (const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
                    methods.set(name,gl[name]);
                    gl[name]=function(...args) {
                        const target=renderer.getRenderTarget();
                        if (inWorld) draws.push({ method:name, pass:inShadow?'shadow':'world-color',
                            renderTarget:target?{width:target.width,height:target.height}:null,
                            viewport:Array.from(gl.getParameter(gl.VIEWPORT)),
                            defaultFramebuffer:gl.getParameter(gl.FRAMEBUFFER_BINDING)===null,
                            buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight] });
                        return methods.get(name).apply(this,args);
                    };
                }
                try { d.renderer.render(); }
                finally {
                    renderer.render=originalRender;
                    renderer.shadowMap.render=originalShadowRender;
                    for (const [name,method] of methods) gl[name]=method;
                }
                const viewport=d.worldScene.viewport, anchor=r.getPosition().clone().project(camera);
                const screenAnchor=[viewport.x+(anchor.x+1)*viewport.width/2,viewport.y+(1-anchor.y)*viewport.height/2];
                const cropRect=[Math.round(screenAnchor[0])-180,Math.round(screenAnchor[1])-140,360,260];
                const crop=()=>{
                    const c=document.createElement('canvas'); c.width=720; c.height=520;
                    c.getContext('2d').drawImage(renderer.domElement,...cropRect.map(v=>v*2),0,0,720,520);
                    return c.toDataURL('image/png');
                };
                const item={ variant,label,zoom,bodyHeading:0,turretHeading:0,tick:d.game.currentTick,
                    cropRect,screenAnchor,parts:meshes.map(describe),selectionBounds:r.bodyVxlBuilder.getLocalBoundingBox(),
                    buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],canvasCss:[1920,1080],dpr:devicePixelRatio,
                    browserScale:visualViewport.scale,rendererPixelRatio:renderer.getPixelRatio(),
                    contextAttributes:gl.getContextAttributes(),defaultFramebufferSamples:gl.getParameter(gl.SAMPLES),
                    viewport:{...viewport},camera:{ position:camera.position.toArray(),matrix:camera.matrixWorld.toArray(),
                        bounds:[camera.left,camera.right,camera.top,camera.bottom],projection:camera.projectionMatrix.toArray() },
                    draws,glError:gl.getError(),png:crop(),full:renderer.domElement.toDataURL('image/png') };
                if (variant==='original' && ['normal','zoom2'].includes(label)) {
                    const saved=meshes.map(m=>[m.material,m.material.colorWrite,m.material.depthWrite]);
                    try {
                        saved.forEach(([m])=>{m.colorWrite=false;m.depthWrite=false;});
                        d.renderer.render(); item.background=crop();
                        item.backgroundFull=renderer.domElement.toDataURL('image/png');
                    } finally {
                        saved.forEach(([m,cw,dw])=>{m.colorWrite=cw;m.depthWrite=dw;}); d.renderer.render();
                    }
                    if (crop()!==item.png) throw Error('Shadow-only layer did not restore exactly');
                }
                return item;
            }
            const cases=[];
            try {
                for (const variant of ['original','runtime']) {
                    cases.push(capture(variant,1,'normal'),capture(variant,2,'zoom2'),capture(variant,1,'restored'));
                }
                const restored=capture('original',1,'final-original');
                if (restored.full!==cases[0].full) throw Error('Final original restoration failed');
                cases.push(restored);
            } finally {
                camera.zoom=savedZoom; camera.updateProjectionMatrix();
                window.__m13Probe.setVariant('A'); unit.turretTrait.facing=oldFacing;
                rotations.forEach(([o,rotation])=>{o.rotation.copy(rotation);o.updateMatrix();});
                r.lastTurretFacing=undefined; r.lastTilt=undefined;
                d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
            }
            return cases;
        });
        const initial=report.cases[0];
        for (const c of report.cases) {
            assert.deepEqual(c.buffer,[3840,2160]); assert.equal(c.tick,initial.tick);
            assert.equal(c.dpr,2); assert.equal(c.rendererPixelRatio,2); assert.equal(c.browserScale,1);
            assert.equal(c.glError,0); assert(c.draws.length>0);
            const color=c.draws.filter(d=>d.pass==='world-color'), shadow=c.draws.filter(d=>d.pass==='shadow');
            assert(color.length>0 && shadow.length>0);
            assert(color.every(d=>d.defaultFramebuffer && d.renderTarget===null && d.viewport.join(',')==='0,64,3504,2096'
                && d.buffer.join(',')==='3840,2160'),'Unexpected world-color framebuffer or viewport');
            assert(shadow.every(d=>!d.defaultFramebuffer && d.renderTarget?.width===8192 && d.renderTarget.height===8192
                && d.viewport.join(',')==='0,0,8192,8192'),'Unexpected shadow render target');
            for (const k of ['position','matrix','bounds']) assert.deepEqual(c.camera[k],initial.camera[k]);
            assert.deepEqual(c.selectionBounds,initial.selectionBounds);
            assert(c.cropRect[0]>=0 && c.cropRect[1]>=0 && c.cropRect[0]+360<=1752 && c.cropRect[1]+260<=1048);
        }
        for (const variant of ['original','runtime']) {
            const [a,b,restored]=report.cases.filter(c=>c.variant===variant);
            assert.equal(a.png,restored.png); assert.equal(a.full,restored.full);
            assert.notDeepEqual(a.camera.projection,b.camera.projection);
            a.parts.forEach((part,i)=>{
                for (const k of Object.keys(part).filter(k=>!['bounds','outputSize'].includes(k))) {
                    assert.deepEqual(part[k],b.parts[i][k]); assert.deepEqual(part[k],restored.parts[i][k]);
                }
                part.outputSize.forEach((v,axis)=>assert(Math.abs(b.parts[i].outputSize[axis]-2*v)<1e-5));
            });
        }
        report.status='PASS_SAME_TICK_RHINO_NATIVE_4K_CAMERA_COMPARISON';
        report.visualStatus='DISPLAY_DIAGNOSTIC_REVIEW_PENDING';
    } finally {
        for (const c of report.cases) {
            for (const field of ['png','full','background','backgroundFull']) {
                if (!c[field]) continue;
                const bytes=Buffer.from(c[field].split(',')[1],'base64');
                const file=`${c.variant}-${c.label}-${field}.png`;
                await fs.writeFile(`${output}/${file}`,bytes);
                c[`${field}File`]=file; c[`${field}Sha256`]=createHash('sha256').update(bytes).digest('hex');
                delete c[field];
            }
        }
        const source=await fs.readFile('scripts/m1/run-rhino-zoom.mjs');
        await fs.writeFile(`${output}/source-run-rhino-zoom.mjs`,source);
        report.sourceSha256=createHash('sha256').update(source).digest('hex');
        await fs.writeFile(`${output}/result.json`,JSON.stringify(report,null,2)+'\n');
    }
    return { status:report.status,output };
}
