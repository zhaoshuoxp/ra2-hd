import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';
const app=await electron.launch({args:[path.resolve('scripts/ui/feedback-art-shell.mjs')],timeout:60000});
try{
    const page=await app.firstWindow();
    const source=(await fs.readFile('public/res/presentation/menu-radar-neutral-r2.png')).toString('base64');
    const result=await page.evaluate(async encoded=>{
        const image=await createImageBitmap(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/png'}));
        const canvas=document.createElement('canvas');canvas.width=1672;canvas.height=941;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,1672,941);
        const rect=[380,150,920,390],pixels=ctx.getImageData(...rect),[,,w,h]=rect;
        const seen=new Uint8Array(w*h),foreground=new Uint8Array(w*h);
        for(let i=0;i<w*h;i++){
            const [r,g,b]=pixels.data.subarray(i*4,i*4+3);
            foreground[i]=g>30&&g>r*.45&&b>r*.2?1:0;
        }
        // Remove cloud fragments that enter the crop; keep the actual metal/gold components.
        for(let i=0;i<w*h;i++)if(foreground[i]&&!seen[i]){
            const stack=[i],component=[];let border=false;seen[i]=1;
            while(stack.length){
                const p=stack.pop(),x=p%w,y=Math.floor(p/w);component.push(p);
                border ||= x===0||y===0||x===w-1||y===h-1;
                for(const q of [x? p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1])if(q>=0&&foreground[q]&&!seen[q]){seen[q]=1;stack.push(q);}
            }
            if(border||component.length<10)for(const p of component)foreground[p]=0;
        }
        const outside=new Uint8Array(w*h),queue=[];
        const enqueue=p=>{if(!outside[p]&&!foreground[p]){outside[p]=1;queue.push(p);}};
        for(let x=0;x<w;x++){enqueue(x);enqueue((h-1)*w+x);}
        for(let y=0;y<h;y++){enqueue(y*w);enqueue(y*w+w-1);}
        for(let read=0;read<queue.length;read++){
            const p=queue[read],x=p%w,y=Math.floor(p/w);
            if(x)enqueue(p-1);if(x<w-1)enqueue(p+1);if(y)enqueue(p-w);if(y<h-1)enqueue(p+w);
        }
        const mask=ctx.createImageData(w,h);let area=0;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            let covered=false;
            for(let dy=-2;dy<=2&&!covered;dy++)for(let dx=-2;dx<=2;dx++){
                const px=x+dx,py=y+dy;
                if(px>=0&&py>=0&&px<w&&py<h&&!outside[py*w+px]){covered=true;break;}
            }
            if(covered){mask.data[(y*w+x)*4+3]=255;area++;}
        }
        ctx.clearRect(0,0,1672,941);ctx.putImageData(mask,rect[0],rect[1]);
        const points=[];
        for(let y=85;y<h;y++)for(let x=0;x<w;x++)if(foreground[y*w+x])points.push([rect[0]+x,rect[1]+y]);
        points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
        const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
        const half=values=>{const result=[];for(const p of values){while(result.length>=2&&cross(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}return result;};
        const lower=half(points),upper=half([...points].reverse());
        const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
        ctx.beginPath();hull.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle='black';ctx.fill();
        const output=document.createElement('canvas');output.width=512;output.height=288;
        const o=output.getContext('2d');o.filter='blur(.6px)';o.drawImage(canvas,0,0,512,288);
        const preview=document.createElement('canvas');preview.width=512;preview.height=288;
        const p=preview.getContext('2d');p.fillStyle='white';p.fillRect(0,0,512,288);p.drawImage(output,0,0);
        image.close();
        return{hull,mask:output.toDataURL().split(',')[1],preview:preview.toDataURL().split(',')[1],area};
    },source);
    await fs.writeFile('public/res/presentation/menu-logo-mask-r2.png',Buffer.from(result.mask,'base64'));
    await fs.writeFile('.artifacts/presentation-r2-20261020/logo-mask-preview.png',Buffer.from(result.preview,'base64'));
    await fs.writeFile('.artifacts/presentation-r2-20261020/logo-mask.json',JSON.stringify({source:'menu-radar-neutral-r2.png',output:'menu-logo-mask-r2.png',size:[512,288],coveredSourcePixelsBeforeWingClosure:result.area,wingHull:result.hull,method:'Source color components, closed native silhouettes, two-pixel shadow margin and static edge sampling'},null,2)+'\n');
    console.log(JSON.stringify({area:result.area}));
}finally{await app.close();}
