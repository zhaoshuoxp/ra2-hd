import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { transferRhinoSurface, representation, builderVersion, settings } from './rhino-surface-transfer';
import { validateRhinoCandidate } from './rhino-candidate-validation.mjs';

const source = '.artifacts/m1-3/source-v1';
const output = process.argv[2] ?? '.artifacts/m1-3b/candidate-v3';
if (existsSync(output)) throw Error('Use a fresh diagnostic directory');
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const acceptedSource = '.artifacts/m1-3a/authoring-v2/primary-realism-v1.png';
const acceptedHash = hash(readFileSync(acceptedSource));
if (acceptedHash !== '9162a8950bc397e26a806e87abf9a7c2e47fa4616507543ab75142cf310f5e38') throw Error('Accepted target changed');
const sources = ['htnk','htnktur','htnkbarl'].map(n => JSON.parse(readFileSync(`${source}/${n}.json`,'utf8')));
const parts = (['body','turret','barrel'] as const).map((role,i) => {
    const data = sources[i], section = data.sections[0], start = performance.now();
    const { geometry, provenance } = transferRhinoSurface(section);
    const serialized = { attributes: Object.fromEntries(Object.entries(geometry.attributes)
        .map(([k,a]) => [k,{ itemSize: a.itemSize, array: Array.from(a.array) }])),
        index: { type: geometry.index!.array.constructor.name, array: Array.from(geometry.index!.array) } };
    return { role, source: data.source, hva: data.hva, section: section.name, transforms: section.appliedHva,
        nativeBounds: [section.minBounds,section.maxBounds], geometry: serialized,
        geometrySha256: hash(JSON.stringify(serialized)), provenance,
        measurements: { buildMs: performance.now()-start, vertices: geometry.attributes.position.count,
            triangles: geometry.index!.count/3, bounds: geometry.boundingBox } };
});
const payload = { unit: 'HTNK', schemaVersion: 1, revision: output.split('/').at(-1), representation, builderVersion,
    authoringSourceSha256: hash(readFileSync('scripts/m1/rhino-surface-transfer.ts')), acceptedSource, acceptedHash, settings,
    material: { armorSpecularWeight: 0.15, paletteRange: [64,79], scope: 'Cloned diagnostic material on one HTNK only' }, parts };
const candidate = { ...payload, identity: hash(JSON.stringify(payload)) };
const validation = validateRhinoCandidate(candidate,sources);
mkdirSync(output,{ recursive: true });
writeFileSync(`${output}/candidate.json`,JSON.stringify(candidate)+'\n');
writeFileSync(`${output}/summary.json`,JSON.stringify({ ...validation, settings,
    parts: parts.map(({geometry,...p}) => p) },null,2)+'\n');
console.log(JSON.stringify({ output, ...validation, parts: parts.map(p => p.measurements) }));
