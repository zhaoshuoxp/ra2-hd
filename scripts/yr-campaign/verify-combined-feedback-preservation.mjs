import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const [beforeDir,afterDir,output]=process.argv.slice(2).map(p=>path.resolve(p));
const materialFollowup=process.argv.includes('--material-followup');
const read=async file=>JSON.parse(await fs.readFile(file));
const oldRows=await read(path.join(beforeDir,'app-inventory.json')),newRows=await read(path.join(afterDir,'app-inventory.json'));
const prefix='Contents/Resources/GameResources/';
const old=new Map(oldRows.filter(r=>r.file.startsWith(prefix)).map(r=>[r.file.slice(prefix.length),r]));
const current=new Map(newRows.filter(r=>r.file.startsWith(prefix)).map(r=>[r.file.slice(prefix.length),r]));
const changed=[...old].filter(([file,row])=>current.has(file)&&current.get(file).sha256!==row.sha256).map(([file])=>file);
const allowed=new Set(materialFollowup?['terrain-newurban-selection.json','campaign/yr/sov05umd/manifest.json']
    :['environment-newurban-selection.json','terrain-newurban-selection.json','terrain-lunar-selection.json',
        ...['all01umd','sov02smd','sov05umd','sov07tmd'].map(name=>`campaign/yr/${name}/manifest.json`)]);
assert(changed.every(file=>allowed.has(file)),'Unexpected existing payload changes: '+changed.join(', '));
const maps=[...old].filter(([file])=>/^campaign\/(ra2|yr)\/.+\.map$/.test(file));
assert.equal(maps.length,40);
for(const[file,row]of maps)assert.equal(current.get(file)?.sha256,row.sha256,file);
const payloads=[...old].filter(([file])=>file.startsWith('campaign/')&&!file.endsWith('/manifest.json'));
for(const[file,row]of payloads)assert.equal(current.get(file)?.sha256,row.sha256,file);
const snow=[...old].filter(([file])=>file.startsWith('environment-packs/snow-')||file.startsWith('terrain-packs/yr-snow-')
    ||file==='environment-snow-selection.json'||file==='terrain-snow-selection.json');
for(const[file,row]of snow)assert.equal(current.get(file)?.sha256,row.sha256,file);
const actorPaint=[...old].filter(([file])=>/^(hd-packs|construction-packs)\//.test(file)&&/\.(png|rgba)$/.test(file));
for(const[file,row]of actorPaint)assert.equal(current.get(file)?.sha256,row.sha256,file);
const resources=dir=>path.join(dir,'Red Alert 2 HD.app/Contents/Resources/GameResources');
const retainedGroups=[];
for(const theater of['newurban','lunar']){
    const aRoot=resources(beforeDir),bRoot=resources(afterDir);
    const a=await read(path.join(aRoot,`terrain-${theater}-selection.json`)),b=await read(path.join(bRoot,`terrain-${theater}-selection.json`));
    const am=await read(path.join(aRoot,'terrain-packs',a.revision,'manifest.json'));
    const bm=await read(path.join(bRoot,'terrain-packs',b.revision,'manifest.json'));
    assert.equal(am.groups.length,bm.groups.length);
    const changes=[];
    for(const group of am.groups){const next=bm.groups.find(g=>g.id===group.id);assert(next);
        assert.deepEqual(next.members,group.members,'Original native terrain geometry: '+group.id);
        if(JSON.stringify(next.variants)!==JSON.stringify(group.variants))changes.push(group.id);
    }
    assert.equal(changes.length,theater==='newurban'?2:materialFollowup?0:3);
    retainedGroups.push({theater,total:am.groups.length,changedMaterials:changes,nativeGeometryUnchanged:true});
}
const report={schema:'yr-combined-feedback-resource-preservation-v1',status:'PASS_ORIGINAL_MAPS_PRIOR_CAMPAIGN_PAYLOADS_SNOW_AND_ACCEPTED_UNIT_PAINT_EXACT',
    beforePackage:beforeDir,afterPackage:afterDir,originalMapsExact:maps.length,priorCampaignPayloadsExact:payloads.length,
    oldSnowFilesExact:snow.length,acceptedActorPaintFilesExact:actorPaint.length,
    existingResourceMetadataChanges:changed,retainedGroups,realProfilesIncluded:false,
    qualification:'New immutable selected materials and additive campaign files are registered separately. Existing Snow paint/construction and accepted unit pixels remain unchanged. User visual acceptance of reopened art remains pending.'};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
