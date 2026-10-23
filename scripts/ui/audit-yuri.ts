// Explicit read-only expansion audit. Never registers gameplay or imports loose overrides.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseMix, resolveMember, type Container } from '../../src/offline/retail';
import { MixFile } from '../../src/data/MixFile';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
const installation = process.argv[2]; if (!installation) throw Error('Pass the explicit read-only installation directory');
const out = '.artifacts/menu-ui/yuri-dormant-v1'; mkdirSync(out,{recursive:true});
const tree: Container[] = [], archives: any[] = [];
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
function visit(source: string, mix: MixFile, depth=0) {
    if (depth > 3) throw Error('Expansion archive depth exceeded');
    tree.push({path:source,mix});
    for (const n of ['localmd.mix','cachemd.mix','conqmd.mix','cameomd.mix','sidec03.mix'])
        if (mix.containsFile(n)) visit(`${source}/${n}`,new MixFile(mix.openFile(n).stream),depth+1);
}
for (const n of ['expandmd01.mix','langmd.mix','ra2md.mix','cameomd.mix']) {
    const b = readFileSync(path.join(installation,n)); archives.push({file:n,bytes:b.length,sha256:hash(b)});visit(n,parseMix(b,n));
}
const resolve = (n: string) => resolveMember(tree,n);
const rulesMember=resolve('rulesmd.ini'),artMember=resolve('artmd.ini');
const rules=new IniFile(rulesMember.file.readAsString()),art=new IniFile(artMember.file.readAsString());
const entries:any[]=[];
for(const kind of ['BuildingTypes','InfantryTypes','VehicleTypes','AircraftTypes']) for(const v of rules.getSection(kind)!.entries.values()) {
 const id=String(v),r=rules.getSection(id); if(!r) continue;
 if(!r.getArray('Owner').includes('YuriCountry') || r.getNumber('TechLevel',-1)<0)continue;
 const a=art.getSection(r.getString('Image',id));
 const cameos=[...new Set([a?.getString('Cameo','xxicon'),a?.getString('AltCameo',a?.getString('Cameo','xxicon'))])].filter(Boolean).map(n=>`${n!.toLowerCase()}.shp`);
 const images=cameos.map(name=>{
  try{const member=resolve(name),shp=new ShpFile(member.file);return{member:name,archive:member.source,sha256:hash(member.file.getBytes()),nativeSize:[shp.width,shp.height],frames:shp.numImages};}
  catch{return{member:name,status:'MISSING_IN_EXPLICIT_EXPANSION_ARCHIVES'};}
 });
 entries.push({id,kind,owners:r.getArray('Owner'),prerequisites:r.getArray('Prerequisite'),requiredHouses:r.getArray('RequiredHouses'),images,status:'DORMANT_NOT_AUTHORED'});
}
writeFileSync(`${out}/inventory.json`,JSON.stringify({status:'DORMANT_SOURCE_VERIFIED_DISPLAY_ROUTE_UNSUPPORTED',archives,
 sources:[rulesMember,artMember].map(r=>({member:r.file.filename,archive:r.source,sha256:hash(r.file.getBytes())})),entries,
 route:'None. The vanilla runtime has two HUD sides and excludes expansion archives. This audit is never referenced by resource registration.',
 production:'Pending consolidated direction; dormant sources and exact roster only, no authored completion claimed.'},null,2)+'\n');
console.log(entries.length,'dormant rule candidates;',entries.reduce((n,r)=>n+r.images.length,0),'icon references');
