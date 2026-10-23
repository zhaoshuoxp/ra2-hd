// Inventory explicit retail archives through native edition lookup and SHP aggregation.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseMix, resolveMember } from '../../src/offline/retail';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { GAME_EDITIONS, type GameEdition } from '../../src/editions/GameEdition';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { IniFile } from '../../src/data/IniFile';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { BuildingAnimArtProps } from '../../src/engine/renderable/entity/building/BuildingAnimArtProps';
import { BuildingShpHelper } from '../../src/engine/renderable/entity/building/BuildingShpHelper';
import { ShpAggregator } from '../../src/engine/renderable/builder/ShpAggregator';
import { AnimProps } from '../../src/engine/AnimProps';
import { AnimationType } from '../../src/engine/renderable/entity/building/AnimationType';
import { sovietBuildingHdFamilies } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { napowrHdFamily } from '../../src/engine/renderable/builder/napowrHdFamily';

const allied = process.argv.includes('--allied');
const yuri = process.argv.includes('--yuri');
const root = process.argv[2] ?? '.local/assets', out = process.argv[3] ?? '.artifacts/m1-6c/source-v1';
if (existsSync(out)) throw Error('Keep earlier evidence; use a new output directory');
mkdirSync(out, {recursive:true}); mkdirSync(path.join(out,'members'));
const hash = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');
const top = new Map(GAME_EDITIONS.yr.archives.map(n => {
    const p = [path.join(root,n),path.join(root,'yr',n),path.join(root,'ra2',n)].find(existsSync);
    if (!p) throw Error(`Missing imported archive ${n}`); return [n,readFileSync(p)];
}));
const settings: Record<string, [string,string,string]> = { TEMPERATE:['T','.tem','unittem.pal'], URBAN:['U','.urb','uniturb.pal'],
    NEWURBAN:['N','.ubn','unitubn.pal'], DESERT:['D','.des','unitdes.pal'], LUNAR:['L','.lun','unitlun.pal'], SNOW:['A','.sno','unitsno.pal'] };
const accepted: any = {...sovietBuildingHdFamilies,NAPOWR:napowrHdFamily};
const plain = (s: any) => s && Object.fromEntries(s.entries);
const seq = (s: any, file: any) => {const {art,...props}=new AnimProps(s,file);return props};
const result: any = {schema:yuri?'yuri-edition-theater-inventory-v1':allied?'allied-edition-theater-inventory-v1':'soviet-edition-theater-inventory-v1',baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    status:'SOURCE_INVENTORY_ONLY_RUNTIME_CONFIRMATION_PENDING',archives:[...top].map(([name,bytes])=>({name,sha256:hash(bytes)})),catalogs:{},matrix:[],uniqueMembers:{},missingMembers:[]};
for (const edition of (yuri ? ['yr'] : ['ra2','yr']) as GameEdition[]) {
    const tree=editionRetailTree(top,edition);
    tree.push({path:'upstream-support/ra2cd.mix',mix:parseMix(readFileSync('.local/upstream-support/ra2cd.mix'),'ra2cd.mix')});
    const rules=new IniFile(resolveMember(tree,GAME_EDITIONS[edition].rules).file.readAsString());
    const art=new IniFile(resolveMember(tree,GAME_EDITIONS[edition].art).file.readAsString());
    const identity=(name:string)=>{const r=resolveMember(tree,name);return {member:name,archive:r.source,memberId:r.memberId,sha256:hash(r.file.getBytes())}};
    const countries = rules.getSection('Sides')!.getString(yuri ? 'ThirdSide' : 'GDI').split(',');
    const deployed = new Set([...rules.getSection('VehicleTypes')!.entries.values()].flatMap(v => {
        const r = rules.getSection(String(v));
        return r?.getString('Owner').split(',').some(c => countries.includes(c))
            && r.getString('DeploysInto') ? [r.getString('DeploysInto')] : [];
    }));
    const ids=[...new Set([...rules.getSection('BuildingTypes')!.entries.values()].flatMap(v=>Array.isArray(v)?v:[v]))].filter(id=>{
        const r=rules.getSection(id);
        if (!r) return false;
        if (!allied && !yuri) return id==='NACNST'||(r.getNumber('AIBasePlanningSide',-1)===1&&r.getNumber('TechLevel',-1)>=0);
        const prereqs = r.getString('Prerequisite').split(',');
        const eligible = r.getString('Owner').split(',').some(c => countries.includes(c));
        return deployed.has(id) && r.getBool('ConstructionYard') || eligible && r.getNumber('TechLevel',-1)>=0
            && (r.getNumber('AIBasePlanningSide',-1)===(yuri ? 2 : 0) || prereqs.some(p => deployed.has(p)));
    });
    if(!allied && !yuri && ids.length!==18)throw Error(`${edition}: expected audited 18-building roster, found ${ids.length}`);
    result.catalogs[edition]=ids.map(id=>({id,rules:plain(rules.getSection(id)), countries: countries.filter(c => {
        const r=rules.getSection(id)!, required=r.getString('RequiredHouses').split(',').filter(Boolean);
        return r.getString('Owner').split(',').includes(c) && (!required.length || required.includes(c))
            && !r.getString('ForbiddenHouses').split(',').includes(c);
    })}));
    for (const theater of edition==='ra2'?['TEMPERATE','URBAN','SNOW']:Object.keys(settings)) {
        const [letter,extension,paletteName]=settings[theater];const palette=new Palette(resolveMember(tree,paletteName).file);
        for (const id of ids) {
            const rule=rules.getSection(id)!,config=art.getSection(rule.getString('Image')||id)!;
            const imageName=config.getString('Image')||rule.getString('Image')||id;
            const anims=new BuildingAnimArtProps();anims.read(config,{hasObject:(n:string)=>!!art.getSection(n),getObject:(n:string)=>({art:art.getSection(n)})});
            const bib=config.getString('BibShape');const names=[imageName,...[...anims.getAll().values()].flat().map(a=>a.image),...(bib?[bib]:[])];
            const images=new Map<string,ShpFile>();
            for(const name of names)for(const c of [name,...['T','U','A','G','N','D','L'].map(ch=>name[0]+ch+name.slice(2))]){
                const filename=c.toLowerCase()+'.shp';if(images.has(filename))continue;
                try{images.set(filename,new ShpFile(resolveMember(tree,filename).file))}catch{}
            }
            const finder=new ImageFinder(images,{settings:{extension,newTheaterChar:letter}});
            const useTheaterExtension=config.getBool('Theater',false),helper=new BuildingShpHelper(finder);
            const animationFiles=helper.collectAnimShpFiles(anims as any,{useTheaterExtension});
            const main=finder.find(imageName,useTheaterExtension),bibFile=bib?finder.find(bib,useTheaterExtension):undefined;
            const infos=helper.getShpFrameInfos({hasShadow:config.getBool('Shadow',true)&&!rule.getBool('NoShadow')},main,bibFile,animationFiles);
            const agg=new ShpAggregator().aggregate([...infos.values()],`agg_${id}.shp`);
            const animations=[...anims.getAll()].flatMap(([type,entries])=>entries.map((a,index)=>{
                const file=animationFiles.get(a);
                if(!file) {
                    if (!allied && !yuri) throw Error(`Missing ${edition}/${theater}/${id}/${a.name}`);
                    result.missingMembers.push({edition,theater,id,name:a.name,image:a.image,type:AnimationType[type],
                        status:'DECLARED_NATIVE_MEMBER_UNRESOLVED',art:plain(a.art)});
                    return undefined;
                }
                const normal=seq(a.art,file),damaged=a.damagedArt&&seq(a.damagedArt,file);
                if(type===AnimationType.BUILDUP||type===AnimationType.UNBUILD)normal.rate=normal.frameCount/(60*rules.getSection('General')!.getNumber('BuildupTime'));
                return {type:AnimationType[type],name:a.name,member:file.filename,image:a.image,offset:a.offset,depthOffset:index+1,flat:a.flat,normal,damaged,art:plain(a.art),damagedArt:plain(a.damagedArt)};
            })).filter(Boolean);
            const members=[...infos.values()].map(({file,hasShadow,frameCount})=>{
                const source=identity(file.filename),key=source.sha256;
                const frames=file.images.map((f,nativeFrame)=>({nativeFrame,x:f.x,y:f.y,width:f.width,height:f.height,legacyRenderSize:[f.width+f.width%2,f.height+f.height%2],empty:!f.imageData.some(Boolean),pixelHash:hash(f.imageData)}));
                if(!result.uniqueMembers[key]){
                    const raw={source,canvas:[file.width,file.height],frames:frames.map((f,n)=>({...f,pixels:Array.from(file.images[n].imageData)}))};
                    writeFileSync(path.join(out,'members',key+'.json'),JSON.stringify(raw));result.uniqueMembers[key]={source,canvas:raw.canvas,totalFrames:frames.length,path:`members/${key}.json`};
                }
                return {source,canvas:[file.width,file.height],totalFrames:file.numImages,visibleFrames:frameCount,hasShadow,shadowStart:hasShadow?frameCount:null,aggregateOffset:agg.imageIndexes.get(file),
                    roles:[...(file===main?['body']:[]),...(file===bibFile?['bib']:[]),...animations.filter(a=>a.member===file.filename).map(a=>a.type)],frames,
                    acceptedHashMatch:accepted[id]?.members.some((m:any)=>m.sha256===key)??false};
            });
            const voxelNames=rule.getBool('TurretAnimIsVoxel')?[rule.getString('TurretAnim')]:[];
            const dependencies=voxelNames.flatMap(n=>[n,...(n.toLowerCase().includes('tur')?[n.replace(/tur/i,'barl')]:[])]).flatMap(n=>['vxl','hva'].map(ext=>{
                try{return identity(n.toLowerCase()+'.'+ext)}catch{return {member:n.toLowerCase()+'.'+ext,status:'ABSENT_OPTIONAL_NATIVE_PART'}}
            }));
            const completeHashMatch=!!accepted[id]&&members.length===accepted[id].members.length&&members.every(m=>m.acceptedHashMatch);
            const fallbackReason=!accepted[id]?'NO_AUTHORED_FAMILY':!completeHashMatch?'DISTINCT_NATIVE_MEMBERS':theater==='SNOW'?'SNOW_GATE_REQUIRES_FULL_EQUIVALENCE':'ACCEPTED_MEMBER_REUSE_CANDIDATE';
            result.matrix.push({edition,theater,id,rules:plain(rule),art:plain(config),imageName,palette:{...identity(paletteName),colors:palette.colors.map(c=>[c.r,c.g,c.b]),remapIndices:[16,31],altPalette:config.getBool('AltPalette')},
                members,animations,dependencies,aggregateFrames:agg.file.numImages,completeHashMatch,fallbackReason,runtime:'NOT_RUN',acceptance:'PENDING_NEW_SCOPE'});
        }
    }
}
result.union=[...new Set(Object.values(result.catalogs).flatMap((rows:any)=>rows.map((r:any)=>r.id)))].sort();
writeFileSync(path.join(out,'inventory.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,rosters:Object.fromEntries(Object.entries(result.catalogs).map(([e,rows]:any)=>[e,rows.length])),union:result.union.length,cells:result.matrix.length,uniqueMembers:Object.keys(result.uniqueMembers).length}));
