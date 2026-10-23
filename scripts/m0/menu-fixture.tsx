import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MenuVideo } from '../../src/gui/screen/mainMenu/component/MenuVideo';
const root=createRoot(document.getElementById('root')!);
let clip:File;
(window as any).makeClip=async()=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
 const ctx=canvas.getContext('2d')!,stream=canvas.captureStream(12),chunks:Blob[]=[];
 const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
 recorder.ondataavailable=e=>chunks.push(e.data);
 const done=new Promise<void>(resolve=>{recorder.onstop=()=>resolve();});
 let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'red':'blue';ctx.fillRect(0,0,32,32);},80);
 recorder.start();await new Promise(r=>setTimeout(r,800));recorder.stop();await done;
 clearInterval(timer);stream.getTracks().forEach(t=>t.stop());
 clip=new File(chunks,'synthetic.webm',{type:'video/webm'});return clip.size;
};
(window as any).setMenu=(kind:string)=>{
 const src=kind==='file'?clip:kind==='url'?(window as any).externalUrl:
  kind==='empty-file'?new File([],'empty.webm',{type:'video/webm'}):kind==='empty-string'?'':kind==='whitespace'?'   ':undefined;
 flushSync(()=>root.render(kind==='unmount'?null:<MenuVideo src={src}/>));
};
(window as any).makeExternalUrl=()=>((window as any).externalUrl=URL.createObjectURL(clip));
(window as any).releaseExternalUrl=()=>URL.revokeObjectURL((window as any).externalUrl);
