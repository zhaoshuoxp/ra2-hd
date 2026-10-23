// Read-only Yuri UI extraction from explicitly named expansion archives.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseMix, type Container } from '../../src/offline/retail';
import { MixFile } from '../../src/data/MixFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
const installation=process.argv[2]; if(!installation) throw Error('Pass the read-only installation directory');
const output='.artifacts/menu-ui/ui-originals';mkdirSync(output,{recursive:true});
const tree:Container[]=[];
function visit(name:string,mix:MixFile,depth=0) {
    if(depth>3) throw Error('Expansion depth exceeded');
    tree.push({path:name,mix});
    for(const child of ['localmd.mix','cachemd.mix','conqmd.mix','sidec03.mix','sidec02md.mix','loadmd.mix'])
        if(mix.containsFile(child)) visit(name+'/'+child,new MixFile(mix.openFile(child).stream),depth+1);
}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const archives=[];
for(const name of ['expandmd01.mix','langmd.mix','ra2md.mix']) {
    const bytes=readFileSync(path.join(installation,name));archives.push({name,sha256:hash(bytes)});
    visit(name,parseMix(bytes,name));
}
const owner=tree.find(x=>x.path.endsWith('/sidec02md.mix'));
if(!owner) throw Error('Original Yuri sidebar archive missing');
const baseArchive=parseMix(readFileSync('.local/assets/ra2/ra2.mix'),'ra2.mix');
const base=new MixFile(baseArchive.openFile('sidec02.mix').stream);
const names=['credits','top','radar','side1','side2','side2b','side3','addon','tab00','tab01','tab02','tab03',
 'diplobtn','optbtn','repair','sell','r-up','r-dn','gclock2','lendcap','bttnbkgd','rendcap','powerp','sidebttn',
 'button00','button01','button02','button03','button04','button06','button07','button08','button09','button10'];
const assets=[];
for(const name of names) {
    const yuriSpecific=name==='radar';
    const member=yuriSpecific?'radary.shp':name+'.shp';
    const mix=yuriSpecific?owner.mix:base;
    const paletteName=yuriSpecific?'radaryuri.pal':'sidebar.pal';
    if(!mix.containsFile(member)) continue;
    const palFile=mix.openFile(paletteName),palette=new Palette(palFile);
    const file=mix.openFile(member),shp=new ShpFile(file),key='yuri-'+name,framesData=[];
    if (yuriSpecific) writeFileSync(output+'/yuri-radar-fixture.json', JSON.stringify({
        width:shp.width,height:shp.height,colors:palette.colors.map(c=>({r:c.r,g:c.g,b:c.b})),
        frames:Array.from({length:shp.numImages},(_,i)=>{
            const f=shp.getImage(i);return {x:f.x,y:f.y,width:f.width,height:f.height,data:Array.from(f.imageData)};
        }),sourceSha256:hash(file.getBytes()),paletteSha256:hash(palFile.getBytes()),
    }));
    for(let f=0;f<shp.numImages;f++) {
        const frame=shp.getImage(f),rgba=new Uint8Array(shp.width*shp.height*4);
        for(let y=0;y<frame.height;y++) for(let x=0;x<frame.width;x++) {
            const i=frame.imageData[y*frame.width+x],c=palette.colors[i];
            rgba.set([c.r,c.g,c.b,i?255:0],((frame.y+y)*shp.width+frame.x+x)*4);
        }
        const name=key+'-'+f+'.rgba';writeFileSync(output+'/'+name,rgba);
        framesData.push({file:name,x:frame.x,y:frame.y,width:frame.width,height:frame.height});
    }
    assets.push({key,member,source:yuriSpecific?owner.path:'ra2.mix/sidec02.mix',sha256:hash(file.getBytes()),palette:paletteName,
        paletteSha256:hash(palFile.getBytes()),width:shp.width,height:shp.height,frames:shp.numImages,framesData});
}
writeFileSync(output+'/inventory-yuri.json',JSON.stringify(assets,null,2));
writeFileSync(output+'/yuri-source.json',JSON.stringify({archives,source:owner.path,
    status:'DORMANT_ART_ONLY_NO_SUPPORTED_YURI_RUNTIME_SIDE',inheritance:'Original Yuri uses the Soviet sidebar with radary.shp and radaryuri.pal overrides.',
    reference:'https://ares-developers.github.io/Ares-docs/new/sidescountries/uiside.html',
    loadingOwners:tree.filter(x=>x.mix.containsFile('ls800yuri.shp')).map(x=>x.path)},null,2));
console.log(JSON.stringify({source:owner.path,families:assets.length,archives}));
