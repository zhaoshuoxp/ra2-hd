// Loopback-only manual evidence page. No game code or browser automation is injected.
import http from 'node:http';
import fs from 'node:fs';
const output=process.env.M02A_OUTPUT??'.artifacts/m0-2a/manual-input';
fs.mkdirSync(output,{recursive:true});
const html=`<!doctype html><meta charset="utf-8"><title>M0.2a manual input check</title>
<style>body{font:18px system-ui;max-width:850px;margin:32px auto}button{font:inherit;padding:10px}canvas{display:block;background:#dde5ee;margin:16px 0}label{display:block;margin:10px 0}pre{white-space:pre-wrap;font-size:13px}</style>
<h1>M0.2a manual input check</h1><p>Use your physical mouse in your normally opened, foreground Chrome window. Click Capture, press Escape, then click the canvas to reacquire capture. Automated clicks do not establish manual acceptance.</p>
<button id="capture">Capture pointer</button><canvas id="target" width="700" height="160"></canvas>
<p>Then open <a href="http://127.0.0.1:4000/" target="_blank">the local game</a>. Test selection, drag selection, movement, attack, map panning, Escape and click-to-recapture. Return here and record only operations you actually observed.</p>
<form id="form"><label><input type="checkbox" name="physical"> I used a physical mouse and a normally launched foreground Chrome window</label>
${['Minimal page captured, released and recaptured','Game unit selection worked','Game drag selection worked','Game ground movement worked','Game attack worked','Game map panning worked','Game Escape released pointer','Game ordinary click reacquired pointer'].map((s,i)=>`<label><input type="checkbox" name="op${i}"> ${s}</label>`).join('')}
<textarea id="notes" rows="3" cols="70" placeholder="Failures or observations"></textarea><p><button>Save manual result locally</button></p></form><pre id="log"></pre>
<script>
const result={url:location.href,userAgent:navigator.userAgent,kind:new URLSearchParams(location.search).get('mode')==='automation'?'automation':'manual-pending',events:[]};
const target=document.querySelector('canvas'),log=document.querySelector('#log');
const state=()=>({time:Date.now(),activeElement:document.activeElement?.tagName,focused:document.hasFocus(),visibility:document.visibilityState,pointerLockElement:document.pointerLockElement?.id??null});
const record=(type,extra={})=>{result.events.push({type,...state(),...extra});log.textContent=JSON.stringify(result,null,2);};
const request=async e=>{record('request',{isTrusted:e.isTrusted});try{await target.requestPointerLock();record('resolved');}catch(error){record('rejected',{name:error.name,message:error.message});}};
document.querySelector('#capture').onclick=request;target.onclick=request;
for(const event of ['pointerlockchange','pointerlockerror','visibilitychange'])document.addEventListener(event,()=>record(event));
window.addEventListener('focus',()=>record('focus'));window.addEventListener('blur',()=>record('blur'));
window.manualInputResult=result;record('ready');
navigator.userAgentData?.getHighEntropyValues(['fullVersionList','architecture','platformVersion']).then(v=>{result.userAgentData=v;});
document.querySelector('form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);result.physicalMouseConfirmed=data.has('physical');result.operations=Array.from({length:8},(_,i)=>({name:e.target.elements['op'+i].parentElement.textContent.trim(),observed:data.has('op'+i)}));result.notes=document.querySelector('#notes').value;record('manual-submission');const r=await fetch('/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});record('saved',{status:r.status});};
</script>`;
const server=http.createServer((req,res)=>{
 if(req.method==='GET'&&new URL(req.url,'http://127.0.0.1').pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(req.method==='POST'&&req.url==='/record'){
  let text='';req.on('data',chunk=>{text+=chunk;if(text.length>65536)req.destroy();});
  req.on('end',()=>{try{const data=JSON.parse(text);fs.writeFileSync(`${output}/manual-${Date.now()}.json`,JSON.stringify(data,null,2));res.end('Saved');}catch{res.statusCode=400;res.end();}});return;
 }
 res.statusCode=404;res.end();
});
server.listen(4001,'127.0.0.1',()=>console.log('Manual input page: http://127.0.0.1:4001/'));
