import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const build = path.resolve(process.argv[2] ?? '.artifacts/menu-ui/build-v3');
const locale=JSON.parse(await fs.readFile('public/res/locale/zh-CN.json','utf8'));
const labels=Object.fromEntries(['campaign','skirmish','lan','movies','options','exit'].map(k=>[k,locale['hd:menu'+k]]));
const output = path.resolve(process.argv[3] ?? `.artifacts/menu-ui/runtime-${Date.now()}`);
const screenAudit = process.argv.includes('--original-screens');
const selectedRevision = process.argv.find(a => a.startsWith('--selected-pack='))?.split('=')[1];
const reviewRevision = selectedRevision ?? process.argv.find(a => a.startsWith('--remaining-pack='))?.split('=')[1];
const cameoCorrections = process.argv.includes('--cameo-corrections') || !!reviewRevision;
const countries = [['Americans','ustates'],['French','france'],['Germans','germany'],['British','ukingdom'],
 ['Russians','russia'],['Confederation','cuba'],['Africans','libya'],['Arabs','iraq'],['Alliance','korea']];
const countrySources = screenAudit ? await Promise.all(countries.map(async ([country,id]) => ({country,id,
 src:'data:image/png;base64,'+(await fs.readFile(`.artifacts/menu-ui/original-screens/ls800${id}.shp.png`)).toString('base64')}))) : [];
await fs.mkdir(output,{recursive:false});
const profile=path.join(output,'profile');await fs.mkdir(profile);
await fs.writeFile(path.join(profile,'resource-registration.json'),JSON.stringify({schemaVersion:1,directory:path.resolve('.local')}));
const report={status:'RUNNING',environment:'macOS Electron; CDP density/aspect emulation, physical input and Windows NOT RUN',errors:[],consoleErrors:[],steps:[],output,build};
let app,page,cdp;
const save=()=>fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));
const shot=async name=>{await page.screenshot({path:path.join(output,name+'.png')});};
const step=async(name,value)=>{report.steps.push({name,value});console.log(name,JSON.stringify(value));await save();};
async function launch() {
 app=await electron.launch({executablePath:await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),cwd:'/private/tmp',args:[build],env:{...process.env,RA2_UI_REVIEW:selectedRevision?'0':'1',RA2_DESKTOP_USER_DATA:profile,RA2_DESKTOP_NO_DISCOVERY:'1'},timeout:60000});
 page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 await page.getByRole('button',{name:labels.skirmish,exact:true}).waitFor({timeout:90000});
 await page.waitForTimeout(1500);cdp=await page.context().newCDPSession(page);
 if(selectedRevision) {
   const expected=JSON.parse(await fs.readFile(path.resolve('.local/ui-packs',selectedRevision,'manifest.json'),'utf8'));
   const actual=await page.evaluate(()=>window.__ra2debug.uiArt.manifest);
   assert.deepEqual(actual,expected);
   await step('native-selected-pack',{revision:actual.revision,entries:actual.assets.length,reviewEnvironment:false,injected:false});
 }
}
async function density(preset,dpr,width=1920,height=1080) {
 await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
 await page.evaluate(p=>window.__ra2debug.generalOptions.graphics.renderResolution.value=p,preset);
 await page.waitForTimeout(350);
}
async function start(country,hold=false) {
 await page.evaluate(country=>{
   const prefs={_r_lastMap:'MP01T4.map',_r_lastMode:'1',_r_lastCountry:String(country),_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',_r_hostOpts:'6;10000;10;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:4,c:5,co:2,s:3,t:1},null,null,null,null])};
   Object.entries(prefs).forEach(([k,v])=>localStorage.setItem(k,v));
 },country);
 await page.getByRole('button',{name:labels.skirmish,exact:true}).click();
 await page.waitForFunction(()=>window.__ra2debug.skirmishLobby);
 if(reviewRevision) await checkDomImages(country);
 await shot('skirmish-'+country);
 if(hold) await page.evaluate(()=>{
   const root=window.__ra2debug.mainMenuController.getCurrentScreen().rootController;
   const screen=[...root.screens.values()].find(s=>s.gameLoader),loader=screen.gameLoader,original=loader.load;
   window.__loadingGameScreen=screen;
   const held=new Promise(resolve=>window.__uiReleaseLoading=resolve);
   loader.load=async function(...args){const result=await original.apply(this,args);await held;loader.load=original;return result;};
 });
 await page.evaluate(()=>{void window.__ra2debug.skirmishLobby.startGame();});
 if(hold) {
   await page.locator('.loading-screen').waitFor({timeout:60000});await page.waitForTimeout(1000);
   for(const [name,p,d] of [['1080p','1080p',1],['4k','4k',2]]){await density(p,d);await shot('loading-'+name);}
   if(screenAudit) {
     await page.evaluate(()=>{
       const screen=window.__loadingGameScreen;
       window.__loadingAudit=screen.loadingScreenApi.loadingScreen;
       window.__loadingSaved={...window.__loadingAudit.htmlEl.options};
     });
     for(const source of countrySources) {
       await page.evaluate(source=>window.__loadingAudit.applyOptions(p=>{
         p.countryName=source.country;p.bgImageSrc=source.src;
         const country=window.__loadingAudit.props.rules.getMultiplayerCountries().find(c=>c.name===source.country);
         p.color=window.__loadingAudit.props.rules.colors.get(country.side===0?'AlliedLoad':'SovietLoad').asHexString();
         p.playerInfos=p.playerInfos.map(player=>({...player,country}));
       }),source);
       await page.waitForFunction(id=>{const c=document.querySelector(`canvas[data-ui-art="loading-unit-${id}"]`);return c&&!c.hidden;},source.id);
       await page.waitForTimeout(100);await shot('country-'+source.id+'-4k');
       const bounds=await page.locator('.loading-content').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};});
       assert(bounds.x>=-1&&bounds.y>=-1&&bounds.right<=bounds.w+1&&bounds.bottom<=bounds.h+1);
       await step('country-'+source.id,{bounds,ui:await page.evaluate(()=>window.__ra2debug.uiArt.metrics())});
     }
     for(const [w,h] of [[1920,1200],[1512,982],[1728,1117],[1280,832],[1440,932]]) {
       await density('native',2,w,h);await shot('loading-aspect-'+w+'x'+h);
       const dimensions=await page.locator('.loading-content').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,screen:[innerWidth,innerHeight]};});
       await step('loading-aspect-'+w+'x'+h,dimensions);
     }
     await page.evaluate(()=>window.__loadingAudit.applyOptions(p=>Object.assign(p,window.__loadingSaved)));
     await density('4k',2);
   }
   await page.evaluate(()=>window.__uiReleaseLoading());
 }
 await page.waitForFunction(()=>window.__ra2debug?.game?.status===1,undefined,{timeout:180000});
 await page.evaluate(()=>{const d=window.__ra2debug;d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u=>/MCV$/.test(u.name)).id],10);});
 await page.waitForFunction(()=>window.__ra2debug.localPlayer.getOwnedObjects().some(u=>/[NG]ACNST/.test(u.name)),undefined,{timeout:30000});
 await page.waitForTimeout(1200);
}
async function checkUiStates(side) {
 const yuri=side==='yuri'?JSON.parse(await fs.readFile('.artifacts/menu-ui/ui-originals/yuri-radar-fixture.json','utf8')):undefined;
 const result=await page.evaluate(async ({side,yuri,remaining})=>{
   const d=window.__ra2debug,hud=d.gameScreen.hud,art=d.uiArt;
   const sprites=[];
   const walk=o=>{if(o.builder?.frames)sprites.push(o);o.getRenderableContainer?.().getChildren().forEach(walk);};
   walk(hud);
   const active=sprites.filter(o=>o.builder.frames[o.getFrame()]?.id.startsWith(side+'-'));
   const live=active.map(o=>({id:o.builder.frames[o.getFrame()].id,hd:o.isHdArtwork,frame:o.getFrame(),entry:o.builder.frames[o.getFrame()],key:o.builder.activeKey}));
   const Sprite=hud.sidebarRadar.cover.constructor,frames=[];
   const names=['credits','top','radar','side1','side2','side2b','side3','addon','tab00','tab01','tab02','tab03',
     'diplobtn','optbtn','repair','sell','r-up','r-dn','sidebttn','lendcap','bttnbkgd','rendcap'];
   if(remaining) names.push('button00','button01','button02','button03','button04','button06','button07','button08','button09','button10');
   if(remaining) names.push('gclock2');
   for(const name of names) {
     let file=hud.images.get(name+'.shp'), palette=hud.palettes.get('sidebar.pal');
     if(yuri) {
       const shared=file,clone=new shared.constructor();
       clone.width=shared.width;clone.height=shared.height;clone.numImages=shared.numImages;clone.images=shared.images;
       let entries=art.frames.get(shared)?.map(e=>({...e,id:e.id.replace('soviet-','yuri-')}));
       if(name==='radar') {
         const Frame=shared.getImage(0).constructor;
         clone.width=yuri.width;clone.height=yuri.height;clone.numImages=yuri.frames.length;
         clone.images=yuri.frames.map(f=>new Frame(new Uint8Array(f.data),f.width,f.height,f.x,f.y));
         palette=new palette.constructor({colors:yuri.colors});
       }
       if(entries)art.frames.set(clone,entries);file=clone;
     }
     const entries=art.frames.get(file);
     if(!entries?.[0]?.id.startsWith(side+'-'))continue;
     const sprite=Sprite.fromShpFile(file,palette,hud.jsxRenderer.camera);
     sprite.setFrame(file.numImages-1);sprite.create3DObject();
     await new Promise(resolve=>setTimeout(resolve,80));
     for(let frame=0;frame<file.numImages;frame++) {
       sprite.setFrame(frame);
       if(name==='gclock2') await new Promise(resolve=>setTimeout(resolve,60));
       const b=sprite.builder, mesh=b.overlay;
       let png, terminalBlack;
       if(name==='radar'&&mesh) {
         const image=mesh.material.map.image,canvas=document.createElement('canvas');
         canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);png=canvas.toDataURL();
         if(frame===file.numImages-1) {
           // All three retail terminal frames have an opaque black display
           // between the unchanged metal rails (native x=14..153).
           const scale=canvas.width/file.width, pixels=canvas.getContext('2d').getImageData(14*scale,0,140*scale,canvas.height).data;
           let nonBlack=0,nonOpaque=0;
           for(let i=0;i<pixels.length;i+=4){if(pixels[i]||pixels[i+1]||pixels[i+2])nonBlack++;if(pixels[i+3]!==255)nonOpaque++;}
           terminalBlack={pixels:pixels.length/4,nonBlack,nonOpaque};
         }
       }
       frames.push({id:entries[frame].id,frame,hd:sprite.isHdArtwork,png,terminalBlack,
         positions:mesh?Array.from(mesh.geometry.getAttribute('position').array):null,
         native:Array.from(b.original.geometry.getAttribute('position').array),
         texture:mesh?[mesh.material.map.image.width,mesh.material.map.image.height]:null});
     }
     sprite.destroy();
   }
   return {live,frames,metrics:art.metrics(),gl:d.renderer.renderer.getContext().getError()};
 },{side,yuri,remaining:!!reviewRevision});
 for(const frame of result.frames)if(frame.png){await fs.writeFile(path.join(output,`${side}-radar-${frame.frame}.png`),Buffer.from(frame.png.split(',')[1],'base64'));delete frame.png;}
 await fs.writeFile(path.join(output,side+'-states.json'),JSON.stringify(result,null,2));
 if(side!=='yuri')assert(result.live.length>10);assert(result.live.every(o=>o.hd),JSON.stringify(result.live.filter(o=>!o.hd)));
 assert(result.frames.every(f=>f.hd),JSON.stringify(result.frames.filter(f=>!f.hd)));
 for(const frame of result.frames)assert.deepEqual(frame.positions,frame.native,`${frame.id}/${frame.frame}`);
 assert.equal(result.frames.filter(f=>f.id===side+'-radar-base').length,33);
 const terminal=result.frames.find(f=>f.terminalBlack)?.terminalBlack;
 assert(terminal);assert.equal(terminal.nonBlack,0);assert.equal(terminal.nonOpaque,0);
 assert.equal(result.gl,0);assert(result.metrics.reservedBytes<=result.metrics.budget);
 await step(side+'-all-ui-states',{frames:result.frames.length,radarFrames:33,liveSprites:result.live.length,metrics:result.metrics,gl:result.gl});
}
async function installReviewPack(revision) {
 const pack=path.resolve('.local/ui-packs',revision);
 const manifest=JSON.parse(await fs.readFile(path.join(pack,'manifest.json'),'utf8'));
 const files=Object.fromEntries(await Promise.all([...new Set(manifest.assets.map(a=>a.file))].map(async file=>[file,(await fs.readFile(path.join(pack,file))).toString('base64')])));
 await page.evaluate(({manifest,files})=>{
   const d=window.__ra2debug,fetchOriginal=window.fetch,previous=d.uiArt.revision;
   const videoUrls=[d.uiArt.menuVideoSource(),d.uiArt.menuVideoSource(true)];
   // Native video elements bypass fetch; keep their allowlisted original pack URLs.
   d.uiArt.menuVideoSource=(original=false)=>videoUrls[original||!d.uiArt.enabled?1:0];
   d.generalOptions.graphics.hdEnabled.value=false;
   window.fetch=(input,init)=>{
     const url=String(input),prefix='/local-ui/'+manifest.revision+'/';
     if(url.startsWith(prefix)) {
       const name=url.slice(prefix.length);
       if(files[name])return Promise.resolve(new Response(Uint8Array.from(atob(files[name]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}}));
       return fetchOriginal('/local-ui/'+previous+'/'+name,init);
     }
     return fetchOriginal(input,init);
   };
   d.uiArt.manifest=manifest;d.generalOptions.graphics.hdEnabled.value=true;
 },{manifest,files});
 await step('unselected-review-pack',{revision,entries:manifest.assets.length});
}
async function checkDomImages(country) {
 await page.waitForTimeout(600);
 const read=()=>page.locator('img').evaluateAll(imgs=>imgs.map(i=>({id:i.dataset.uiHdImage,width:i.width,height:i.height,natural:[i.naturalWidth,i.naturalHeight],bounds:[i.getBoundingClientRect().width,i.getBoundingClientRect().height]})));
 const css=await page.evaluate(async()=>{
   const root=document.getElementById('ra2web-root'), sources=[];
   for(const [name,selector,w,h] of [['icons-24','.select',288,24],['mnbttn','.dialog-button',378,25],...['cue-i','cce-i','cce-il','cce-ir'].map(n=>[n,'input[type="checkbox"]',18,18])]) {
     if(!root.querySelector(selector))continue;
     const url=root.style.getPropertyValue('--res-'+name).match(/url\("?([^"\)]+)"?\)/)?.[1];
     const size=await new Promise(resolve=>{const image=new Image();image.onload=()=>resolve([image.naturalWidth,image.naturalHeight]);image.onerror=()=>resolve([]);image.src=url;});
     sources.push({name,logical:[w,h],size});
   }
   return sources;
 });
 assert(css.length>=4);assert(css.every(s=>s.size[0]===s.logical[0]*4&&s.size[1]===s.logical[1]*4));
 const hd=await read();const active=hd.filter(i=>i.id);
 assert(active.length>0,'Expected native lobby PCX images');
 assert(active.every(i=>i.natural[0]===i.width*4&&i.natural[1]===i.height*4));
 await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.hdEnabled.value=false);
 await page.waitForTimeout(200);const original=await read();
 assert.deepEqual(hd.map(i=>i.bounds),original.map(i=>i.bounds));
 const off=await page.evaluate(()=>window.__ra2debug.uiArt.metrics());
 assert.equal(off.reservedBytes,0);assert.equal(off.domImageGpuBytesUpperBound,0);
 await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.hdEnabled.value=true);
 await page.waitForTimeout(400);
 const restored=await read();assert.equal(restored.filter(i=>i.id).length,active.length);
 await step('native-pcx-'+country,{active,css,off});
}
async function checkRemainingCameos(manifest) {
 const ids=manifest.assets.filter(a=>a.id.endsWith('.shp')).map(a=>a.id.slice(0,-4));
 const results=[];
 for(let offset=0;offset<ids.length;offset+=12) {
   const batch=ids.slice(offset,offset+12);
   await page.evaluate(batch=>{
     const d=window.__ra2debug,c=d.gameScreen.hud.sidebarCard,m=c.props.sidebarModel;
     const fallback=d.game.rules.infantryRules.get('E1');
     m.activeTab.items=batch.map((cameo,i)=>({target:{type:0,rules:fallback},cameo,disabled:false,progress:0,quantity:1,status:0}));
     m.activeTab.needsUpdate=true;
   },batch);
   await page.waitForTimeout(700);
   const result=await page.evaluate(count=>{
     const d=window.__ra2debug,c=d.gameScreen.hud.sidebarCard;
     return {slots:c.slotObjects.slice(0,count).map(s=>{const b=s.builder,o=b.overlay;return {hd:s.isHdArtwork,id:b.frames?.[b.getFrame()]?.id,positions:o?Array.from(o.geometry.getAttribute('position').array):null,native:Array.from(b.original.geometry.getAttribute('position').array)};}),metrics:d.uiArt.metrics(),gl:d.renderer.renderer.getContext().getError()};
   },batch.length);
   result.ids=batch;results.push(result);
   assert(result.slots.every((s,i)=>s.hd&&s.id===batch[i]+'.shp'),JSON.stringify(result));
   for(const s of result.slots)assert.deepEqual(s.positions,s.native);
   assert.equal(result.gl,0);assert(result.metrics.reservedBytes<=result.metrics.budget);
   await shot('remaining-cameos-'+offset);
 }
 await fs.writeFile(path.join(output,'remaining-cameos.json'),JSON.stringify(results,null,2));
 await step('remaining-cameo-coverage',{ids:ids.length,batches:results.length,peakBytes:Math.max(...results.map(r=>r.metrics.reservedBytes))});
}
async function leave() {
 const continueLabel=await page.evaluate(()=>window.__ra2debug.gameScreen.strings.get('GUI:Continue'));
 const abort=await page.evaluate(()=>{const d=window.__ra2debug;d.gameScreen.menu.open();return d.gameScreen.strings.get('GUI:AbortMission');});
 await page.getByText(abort,{exact:true}).click();
 const quit=await page.evaluate(()=>window.__ra2debug.gameScreen.strings.get('GUI:Quit'));
 await page.getByText(quit,{exact:true}).click();
 await page.getByRole('button',{name:continueLabel,exact:true}).click({timeout:30000});
 await page.locator('input[name="gameSpeed"]').waitFor({timeout:30000});
 const back=await page.evaluate(()=>window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
 await page.getByText(back,{exact:true}).click();
 await page.getByRole('button',{name:labels.skirmish,exact:true}).waitFor({timeout:60000});await page.waitForTimeout(1000);
 await step('return-disposal',await page.evaluate(()=>({gameCleared:!window.__ra2debug.game,ui:window.__ra2debug.uiArt.metrics()})));
}
try {
 await launch();
 if(screenAudit) {
   await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.videoWidth===1896&&v.currentTime>0;});
   await step('original-menu-video-hd',await page.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,duration:v.duration,source:v.currentSrc,error:v.error})));
 }
 const items=await page.locator('button.menu-button').evaluateAll(bs=>bs.map(b=>({label:b.textContent,disabled:b.disabled})));
 assert.deepEqual(items.map(b=>b.disabled),[true,false,true,true,false,false]);await step('six-items',items);
 await page.evaluate(()=>{window.__uiHome=window.__ra2debug.mainMenuController.getCurrentScreen();for(const i of [0,2,3]){document.querySelectorAll('button.menu-button')[i].click();window.__ra2debug.mainMenu.onSidebarButtonClick(i);}});
 assert(await page.evaluate(()=>window.__uiHome===window.__ra2debug.mainMenuController.getCurrentScreen()));
 await page.getByRole('button',{name:labels.skirmish,exact:true}).focus();await page.keyboard.press('Tab');
 assert.equal(await page.locator(':focus').textContent(),labels.options);await page.keyboard.press('Enter');
 await page.getByRole('combobox',{name:'Display resolution'}).waitFor();await shot('options');
 const back=await page.evaluate(()=>window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
 await page.getByText(back,{exact:true}).click();await page.getByRole('button',{name:labels.skirmish,exact:true}).waitFor();
 for(const [name,p,d] of [['1080p','1080p',1],['1440p','1440p',4/3],['4k','4k',2]]){await density(p,d);await shot('menu-'+name);}
 for(const [w,h] of [[1024,768],[1280,800],[1920,1200],[1512,982],[1728,1117],[1280,832],[1440,932],[2560,1080]]) {
  await density('1080p',1,w,h);
  const rects=await page.locator('button.menu-button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  assert(rects.every(r=>r.x>=0&&r.y>=0&&r.right<=w+1&&r.bottom<=h+1));await step('aspect-'+w+'x'+h,rects);
  if(screenAudit) await shot('menu-aspect-'+w+'x'+h);
 }
 await density('1080p',1);
 await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.hdEnabled.value=false);await page.waitForTimeout(100);await shot('menu-original');
 assert.equal(await page.evaluate(()=>window.__ra2debug.uiArt.metrics().reservedBytes),0);
 if(screenAudit) {
   await page.waitForFunction(()=>document.querySelector('video')?.videoWidth===632);
   await step('original-menu-video-off',await page.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,error:v.error})));
 }
 await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.hdEnabled.value=true);
 if(reviewRevision && !selectedRevision) await installReviewPack(reviewRevision);
 await start(5,true);
 if(screenAudit || reviewRevision) {await checkUiStates('soviet');await checkUiStates('yuri');}
 const coverage=[];
 for(const [name,p,d] of [['1080p','1080p',1],['1440p','1440p',4/3],['4k','4k',2]]){
   await density(p,d);await shot('game-'+name);
   coverage.push(await page.evaluate(()=>{const d=window.__ra2debug,c=d.renderer.renderer.domElement;return{logical:[d.renderer.width,d.renderer.height],buffer:[c.width,c.height],camera:d.worldView?.camera?.position?.toArray(),ui:d.uiArt.metrics(),memory:d.renderer.renderer.info.memory,gl:d.renderer.renderer.getContext().getError()};}));
 }
 assert.deepEqual(coverage[0].logical,coverage[2].logical);assert(coverage.every(c=>c.gl===0));await step('same-view-density',coverage);
 await fs.writeFile(path.join(output,'runtime-roster.json'),JSON.stringify(await page.evaluate(()=>{
   const d=window.__ra2debug,g=d.game;
   return [...g.rules.buildingRules.values(),...g.rules.infantryRules.values(),...g.rules.vehicleRules.values(),...g.rules.aircraftRules.values()].flatMap(r=>{
     if(!g.art.hasObject(r.name,r.type))return[];const a=g.art.getObject(r.name,r.type);
     return [{id:r.name,type:r.type,techLevel:r.techLevel,cameo:a.cameo+'.shp',alternate:a.altCameo+'.shp'}];
   });
 }),null,2));
 await step('world-packs',await page.evaluate(()=>({soviet:window.__ra2debug.sovietBuildingsHd,conscript:window.__ra2debug.conscriptHd,rhino:window.__ra2debug.rhinoHd})));
 // A clearly labeled native HUD fixture exercises the authored roster and live overlay states.
 await page.evaluate(()=>{
   const d=window.__ra2debug,card=d.gameScreen.hud.sidebarCard,model=card.props.sidebarModel;
   window.__uiItems=model.activeTab.items;window.__uiTab=model.activeTab;
   const ids=['GAPOWR','NAPOWR','E1','E2','HTNK','MTNK','TESLA','AEGIS','V3','DOG','HARV','JUMPJET'];
   const all=[...d.game.rules.buildingRules.values(),...d.game.rules.infantryRules.values(),...d.game.rules.vehicleRules.values(),...d.game.rules.aircraftRules.values()];
   model.activeTab.items=ids.map((id,i)=>{const rules=all.find(r=>r.name===id),art=d.game.art.getObject(rules.name,rules.type);return{target:{type:0,rules},cameo:art.cameo,disabled:i===3,progress:.45,quantity:i===4?3:1,status:i===4?2:i===6?3:i===8?4:0};});
   model.activeTab.needsUpdate=true;
 });
 await page.waitForTimeout(1200);await shot('sidebar-fixture-4k');await density('1080p',1);await shot('sidebar-fixture-1080p');await density('4k',2);
 const fixture=await page.evaluate(()=>{const d=window.__ra2debug,c=d.gameScreen.hud.sidebarCard;return{ui:d.uiArt.metrics(),active:c.slotObjects.map(s=>s.isHdArtwork),names:c.nameObjects.map(n=>n.value),labels:c.nameObjects.map(n=>({transparent:!n.props.background,outline:n.props.outlineWidth,font:n.ctx.font})),status:c.labelObjects.map(n=>({value:n.value,font:n.ctx.font,width:n.ctx.canvas.width,logicalWidth:n.props.width})),quantities:c.quantityObjects.map(n=>({value:n.value,font:n.ctx.font})),geometry:c.slotObjects.slice(0,2).map(s=>s.getSize())};});
 await step('cameo-fixture',fixture);
 assert.equal(fixture.active.filter(Boolean).length,12);
 assert(fixture.labels.every(label=>label.transparent&&label.outline===0.75&&/500/.test(label.font)&&/Fira/.test(label.font)));
 assert(fixture.status.every(label=>/300/.test(label.font)&&label.width>label.logicalWidth));
 assert(fixture.quantities.every(label=>/300/.test(label.font)));
 if(cameoCorrections) {
   const pack=path.resolve('.local/ui-packs/'+(reviewRevision ?? 'cameo-corrections-v1'));
   const manifest=JSON.parse(await fs.readFile(path.join(pack,'manifest.json'),'utf8'));
   const files=selectedRevision ? {} : Object.fromEntries(await Promise.all(['ccomicon.png','desoicon.png','csphicon.png','ahrvicon.png','cameo-rank.png'].map(async file=>[file,'data:image/png;base64,'+(await fs.readFile(path.join(pack,file))).toString('base64')])));
   await page.evaluate(({manifest,files,selected})=>{
     const d=window.__ra2debug,art=d.uiArt;
     if(!selected) {
       d.generalOptions.graphics.hdEnabled.value=false;
       window.__savedCameoManifest=art.manifest;window.__savedCameoFetch=window.fetch;
       const previous=art.revision;
       window.fetch=(input,init)=>{
         const url=String(input),prefix='/local-ui/'+manifest.revision+'/';
         if(url.startsWith(prefix)) {
           const name=url.slice(prefix.length);
           if(files[name]) {
             const bytes=Uint8Array.from(atob(files[name].split(',')[1]),c=>c.charCodeAt(0));
             return Promise.resolve(new Response(bytes,{headers:{'Content-Type':'image/png'}}));
           }
           return window.__savedCameoFetch('/local-ui/'+previous+'/'+name,init);
         }
         return window.__savedCameoFetch(input,init);
       };
       art.manifest=manifest;d.generalOptions.graphics.hdEnabled.value=true;
     }
     const model=d.gameScreen.hud.sidebarCard.props.sidebarModel;
     const all=[...d.game.rules.infantryRules.values(),...d.game.rules.vehicleRules.values(),...d.game.rules.buildingRules.values()];
     const ids=['ccomicon','ccomuico','desoicon','desouico','csphicon','ahrvicon','giicon','giuico'];
     model.activeTab.items=ids.map((cameo,i)=>{
       const rules=all.find(r=>{const a=d.game.art.getObject(r.name,r.type);return a.cameo===cameo||a.altCameo===cameo;});
       if(!rules)throw Error('Missing retail cameo fixture '+cameo);
       return{target:{type:0,rules},cameo,disabled:i===3,progress:.45,quantity:i===2?3:1,status:i===2?2:i===4?3:0};
     });
     model.activeTab.needsUpdate=true;
   },{manifest,files,selected:!!selectedRevision});
   await page.waitForTimeout(1000);
   const ranked=await page.evaluate(()=>{
     const d=window.__ra2debug,c=d.gameScreen.hud.sidebarCard,builders=c.slotObjects.slice(0,8).map(s=>s.builder);
     return{active:c.slotObjects.slice(0,8).map(s=>s.isHdArtwork),ui:d.uiArt.metrics(),
       entries:builders.map(b=>({entry:b.frames[b.getFrame()],key:b.activeKey,loaded:!!b.asset})),
       shared:[[0,1],[2,3],[6,7]].map(([a,b])=>!!builders[a].asset&&builders[a].asset.texture===builders[b].asset?.texture),
       rankPresent:builders.map(b=>!!b.asset?.overlayTexture),gl:d.renderer.renderer.getContext().getError()};
   });
   await step('shared-rank-fixture',ranked);
   assert(ranked.active.every(Boolean));assert(ranked.shared.every(Boolean));
   assert.deepEqual(ranked.rankPresent,[false,true,false,true,false,false,false,true]);
   assert.equal(ranked.gl,0);assert(ranked.ui.reservedBytes<=ranked.ui.budget);
   await shot('shared-rank-fixture-4k');await density('1080p',1);await shot('shared-rank-fixture-1080p');await density('4k',2);
   if(reviewRevision) await checkRemainingCameos(manifest);
   await page.evaluate(selected=>{
     const d=window.__ra2debug;d.generalOptions.graphics.hdEnabled.value=false;
     if(!selected) {d.uiArt.manifest=window.__savedCameoManifest;window.fetch=window.__savedCameoFetch;}
     window.__uiTab.items=window.__uiItems;window.__uiTab.needsUpdate=true;
     d.generalOptions.graphics.hdEnabled.value=true;
   },!!selectedRevision);
 }
 // Exercise the same Tooltip class used by unit hover, with localized names.
 const unitLabels=await page.evaluate(()=>{
   const d=window.__ra2debug,h=d.worldInteraction.tooltipHandler;
   const originalHover=h.mapHoverHandler.getCurrentHover,results=[];
   try {
     for(const id of ['E1','E2','HTNK']) {
       const rules=d.game.rules.infantryRules.get(id)??d.game.rules.vehicleRules.get(id);
       const entity={getUiName:()=>rules.uiName,gameObject:{id:0}};
       h.destroyTooltip();h.mapHoverHandler.getCurrentHover=()=>({entity});
       h.currentHover.entity=h.lastHover.entity=entity;
       h.paused=false;h.isTouch=false;h.needsHoverTimeReset=false;
       h.hoverStartTime=performance.now()-1000;h.lastUpdateTime=undefined;h.onFrame();
       h.tooltip.create3DObject();
       const image=h.tooltip.texture.image;
       results.push({id,text:h.tooltip.text,width:image.width,height:image.height,png:image.toDataURL()});
     }
   } finally {
     h.destroyTooltip();h.mapHoverHandler.getCurrentHover=originalHover;
     h.currentHover.entity=h.lastHover.entity=undefined;h.hoverStartTime=undefined;
   }
   return results;
 });
 for(const label of unitLabels){await fs.writeFile(path.join(output,`unit-label-${label.id}.png`),Buffer.from(label.png.split(',')[1],'base64'));delete label.png;}
 await step('native-unit-labels',unitLabels);
 await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.hdEnabled.value=false);await page.waitForTimeout(200);await shot('sidebar-original-fixture');
 await step('hd-off',await page.evaluate(()=>window.__ra2debug.uiArt.metrics()));
 await page.evaluate(()=>{const d=window.__ra2debug;d.generalOptions.graphics.hdEnabled.value=true;window.__uiTab.items=window.__uiItems;window.__uiTab.needsUpdate=true;});
 await leave();
 await start(0);if(screenAudit || reviewRevision) await checkUiStates('allied');await shot('allied-second-match');await leave();
 await step('errors',{page:report.errors,console:report.consoleErrors});assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);
 const closed=app.waitForEvent('close',{timeout:15000});await page.getByRole('button',{name:labels.exit,exact:true}).click();await closed;app=undefined;
 await step('desktop-quit','PASS');
 await launch();await step('restart',await page.evaluate(()=>({hd:window.__ra2debug.generalOptions.graphics.hdEnabled.value,render:window.__ra2debug.generalOptions.graphics.renderResolution.value})));
 report.status='PASS_BOUNDED_NATIVE_RUNTIME';
} catch(error){report.status='FAIL';report.failure=error.stack;console.error(error);if(page&&!page.isClosed())await shot('failure').catch(()=>{});process.exitCode=1;}
finally{await save();if(app)await app.close();}
