import fs from 'node:fs/promises';
import { installDisplayProbe } from './display-review-probe.mjs';

export async function runShroudAnimationReview(page, output) {
    await fs.mkdir(output, { recursive: false });
    await page.evaluate(installDisplayProbe);
    const result = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.stop();
        let shroud;
        d.worldScene.scene.traverse(o => { if (o.name === 'map_shroud_layer') shroud = o.children[0]; });
        if (!shroud) throw Error('No shroud mesh');
        const images = [];
        const capture = name => {
            const c = window.__m14.capture('4k', true); images.push({ name, ...c });
        };
        const uv = shroud.geometry.attributes.uv, savedUv = uv.array.slice();
        const material = shroud.material, savedFragment = material.fragmentShader, savedKey = material.customProgramCacheKey;
        const positions = shroud.geometry.attributes.position.array;
        capture('normal');
        shroud.visible = false; capture('shroud-hidden'); shroud.visible = true;
        // Full black constant shader distinguishes geometry cracks from texture sampling.
        material.fragmentShader = 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }';
        material.customProgramCacheKey = () => 'm14-shroud-constant';
        material.needsUpdate = true; capture('constant-black');
        material.fragmentShader = savedFragment; material.customProgramCacheKey = savedKey; material.needsUpdate = true;
        const map = material.map.image;
        const savedMap = map.data.slice();
        const tileWidth = Math.round((Math.max(...savedUv.slice(0,16).filter((_,i)=>i%2===0)) - Math.min(...savedUv.slice(0,16).filter((_,i)=>i%2===0))) * map.width);
        const tileHeight = Math.round((Math.max(...savedUv.slice(0,16).filter((_,i)=>i%2===1)) - Math.min(...savedUv.slice(0,16).filter((_,i)=>i%2===1))) * map.height);
        for (let by=0;by<map.height;by+=tileHeight) for(let bx=0;bx<map.width;bx+=tileWidth)
            for(let y=0;y<tileHeight;y++) for(let x=0;x<tileWidth;x++) {
                const dst=((by+y)*map.width+bx+x)*4+3;
                if(savedMap[dst]!==254) continue;
                let shade=254;
                for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
                    const sx=x+dx,sy=y+dy;
                    if(sx<0||sy<0||sx>=tileWidth||sy>=tileHeight)continue;
                    const value=savedMap[((by+sy)*map.width+bx+sx)*4+3];
                    if(value>=2)shade=Math.min(shade,value);
                }
                map.data[dst]=shade;
            }
        material.map.needsUpdate=true;
        function inset() {
            for(let base=0;base<uv.array.length;base+=16) {
                let l=1,r=0,b=1,t=0;
                for(let i=base;i<base+16;i+=2){l=Math.min(l,uv.array[i]);r=Math.max(r,uv.array[i]);b=Math.min(b,uv.array[i+1]);t=Math.max(t,uv.array[i+1]);}
                for(let i=base;i<base+16;i+=2){uv.array[i]=l+0.5/map.width+(uv.array[i]-l)/(r-l)*(r-l-1/map.width);uv.array[i+1]=b+0.5/map.height+(uv.array[i+1]-b)/(t-b)*(t-b-1/map.height);}
            }
            uv.needsUpdate=true;
        }
        inset(); capture('coverage-expanded');
        const covered = savedUv.slice(0,16);
        for(let base=0;base<uv.array.length;base+=16)uv.array.set(covered,base);
        inset(); capture('fully-covered-expanded');
        map.data.set(savedMap);material.map.needsUpdate=true;
        for(let base=0;base<uv.array.length;base+=16)uv.array.set(covered,base);
        uv.needsUpdate=true;capture('fully-covered-original');
        uv.array.set(savedUv);uv.needsUpdate=true;

        const palette = material.palette.image;
        const geometry = { positions: Array.from(positions), uv: Array.from(uv.array),
            mapSize: [map.width, map.height], sampleIndices: Array.from(map.data).filter((_,i) => i % 4 === 3),
            palette: Array.from(palette.getContext('2d').getImageData(0,0,palette.width,palette.height).data),
            paletteSize: [palette.width,palette.height] };
        const plant = d.renderableManager.getRenderableByGameObject(window.__m12Plant);
        const models = [['body',plant.mainObj],...[...plant.animObjects].flatMap(([type,ms]) => ms.map(m=>[String(type),m]))]
            .filter(([,m])=>m?.get3DObject());
        const state = models.map(([type,m])=>({type,frame:m.builder.getFrame(),offset:m.builder.frameOffset,
            visible:m.get3DObject().visible,keys:Object.keys(m.builder),identity:m.builder.hdOverride?.identity}));
        uv.array.set(savedUv);uv.needsUpdate=true;
        d.renderer.render(); d.gameScreen.gameAnimationLoop.start();
        return { images, geometry, state };
    });
    for (const image of result.images) {
        await fs.writeFile(`${output}/${image.name}.png`, Buffer.from(image.png.split(',')[1], 'base64')); delete image.png;
    }
    await fs.writeFile(`${output}/result.json`, JSON.stringify(result,null,2)+'\n');
    return { status:'CAPTURED_DIAGNOSIS',output };
}
