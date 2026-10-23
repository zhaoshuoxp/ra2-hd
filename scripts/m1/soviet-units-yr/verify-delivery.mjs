import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const directory=path.resolve(process.argv[2]);
const validationRevision=process.argv[3]??'v1';
const receipt=JSON.parse(await fs.readFile(path.join(directory,'package-receipt.json'),'utf8'));
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const row of receipt.files) {
    const file=path.join(receipt.folder,row.file);
    if(row.link)assert.equal(await fs.readlink(file),row.link,row.file);
    else assert.equal(await hash(file),row.sha256,row.file);
}
const resources=JSON.parse(await fs.readFile('docs/m1-7-yr-resources.json','utf8'));
for(const row of resources.files)assert.equal(await hash(path.join(receipt.resources,row.path)),row.sha256,row.path);
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',receipt.app],{stdio:'inherit'});
const zip=path.join(directory,'RA2-HD-YR-Soviet-Units-R1.zip');
try {await fs.access(zip);throw Error('Refusing to replace an existing ZIP');}catch(e){if(e.code!=='ENOENT')throw e;}
execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',receipt.folder,zip]);
execFileSync('/usr/bin/unzip',['-tq',zip],{stdio:'inherit'});
const validation=JSON.parse(await fs.readFile('.artifacts/m1-7-yr/full-review-check-v1.json','utf8'));
assert.equal(validation.status,'PASS_OFFLINE_COMPLETE_FAMILY_EMBEDDED_REVIEW');
const cases=[];
for(const name of [`packaged-temperate-${validationRevision}`,`packaged-snow-${validationRevision}`]) {
    const result=JSON.parse(await fs.readFile(`.artifacts/m1-7-yr/${name}/result.json`,'utf8'));
    assert.equal(result.status,'PASS_PACKAGED_YR_ROSTER_AND_RA2_REGRESSION',name);
    cases.push({name,status:result.status,cases:result.cases.map(c=>({edition:c.edition,theater:c.theater,units:c.unitHd.status}))});
}
const result={status:'PASS_SIGNED_PACKAGE_INVENTORY_ZIP_AND_FOUR_EDITION_THEATER_RUNS',
    folder:receipt.folder,app:receipt.app,resources:receipt.resources,zip,zipBytes:(await fs.stat(zip)).size,zipSha256:await hash(zip),
    runtimeSourceHead:receipt.runtimeSourceHead,inventoryEntries:receipt.files.length,resourceFiles:receipt.resourceFiles,newUnitResourceFiles:resources.files.length,
    review:{path:path.join(receipt.folder,'YR-Soviet-Units-Full-Review.html'),sha256:await hash(path.join(receipt.folder,'YR-Soviet-Units-Full-Review.html')),status:validation.status},
    cases,finalAcceptance:'PENDING_COMPLETE_FAMILY_VISUAL_AND_GAMEPLAY_REVIEW',mainIntegration:'NOT_MERGED_BACK',
    disclosure:'Controlled native action, frame, resource and package tests; not Windows, campaign or natural-match completion.'};
await fs.writeFile(path.join(directory,'delivery-receipt.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,zip,zipBytes:result.zipBytes}));
