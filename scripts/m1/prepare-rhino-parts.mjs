import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='.artifacts/m1-3d',hash=b=>createHash('sha256').update(b).digest('hex');
execFileSync('bun',['build','scripts/m1/rhino-parts/adapter.ts','--target','browser','--format','iife','--outfile',`${root}/adapter.js`],{stdio:'inherit'});
const accepted=JSON.parse(await fs.readFile('.artifacts/m1-4/pause-and-shroud/build-identity.json'));
const files={};
async function walk(dir,prefix=''){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
        const name=prefix+entry.name;
        if(entry.isDirectory())await walk(`${dir}/${entry.name}`,`${name}/`);
        else files[name]=hash(await fs.readFile(`${dir}/${entry.name}`));
    }
}
await walk(`${root}/build`);
if(JSON.stringify(Object.entries(files).sort())!==JSON.stringify(Object.entries(accepted.files).sort()))throw Error('Build differs from accepted final M1.4');
const resources={};
for(const file of ['adapter.js','candidate-v2/manifest.json','candidate-v2/body-0.png','candidate-v2/body-90.png','candidate-v2/turret-0.png','candidate-v2/turret-90.png'])resources[file]=hash(await fs.readFile(`${root}/${file}`));
await fs.writeFile(`${root}/build-identity.json`,JSON.stringify({checkout:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files,resources,
    contract:'Accepted final M1.4 build bytes, reference 900; opt-in four-part Rhino adapter and images served separately.'},null,2)+'\n');
console.log(`PASS: ${Object.keys(files).length} build files equal accepted final M1.4; four-part resource identities recorded.`);
