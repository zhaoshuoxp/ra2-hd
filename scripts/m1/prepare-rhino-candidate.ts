import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { authorRhinoPart, representation, builderVersion } from './rhino-geometry';

const source = process.argv[2] ?? '.artifacts/m1-3/source-v1';
const output = process.argv[3] ?? '.local/hd-packs/rhino-phase-a/2';
if (existsSync(output)) throw Error('Candidate revisions are immutable; use a fresh directory');
const hash = (v: string|Uint8Array) => createHash('sha256').update(v).digest('hex');
const parts = (['body','turret','barrel'] as const).map((role,i) => {
    const data = JSON.parse(readFileSync(`${source}/${['htnk','htnktur','htnkbarl'][i]}.json`,'utf8'));
    const section=data.sections[0], start=performance.now();
    const geometry=authorRhinoPart(role,section), buildMs=performance.now()-start;
    const serialized={attributes:Object.fromEntries(Object.entries(geometry.attributes)
        .map(([k,a])=>[k,{itemSize:a.itemSize,array:Array.from(a.array)}])),
        index:{type:geometry.index!.array.constructor.name,array:Array.from(geometry.index!.array)}};
    return {role,source:data.source,hva:data.hva,section:section.name,transforms:section.appliedHva,
        nativeBounds:[section.minBounds,section.maxBounds],geometry:serialized,
        geometrySha256:hash(JSON.stringify(serialized)),measurements:{buildMs,
            vertices:geometry.attributes.position.count,triangles:geometry.index!.count/3,
            bytes:Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,geometry.index!.array.byteLength),
            bounds:geometry.boundingBox}};
});
const payload={unit:'HTNK',schemaVersion:1,revision:output.split('/').at(-1),representation,builderVersion,
    authoringSourceSha256:hash(readFileSync('scripts/m1/rhino-geometry.ts')),parts};
const identity=hash(JSON.stringify(payload));
mkdirSync(output,{recursive:true});
writeFileSync(`${output}/candidate.json`,JSON.stringify({...payload,identity})+'\n');
console.log(JSON.stringify({output,identity,parts:parts.map(({geometry,...p})=>p)},null,2));
