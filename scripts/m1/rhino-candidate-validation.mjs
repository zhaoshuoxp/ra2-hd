import { createHash } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const plainSection = section => Object.fromEntries(['name','normalsMode','minBounds','maxBounds',
    'sizeX','sizeY','sizeZ','hvaMultiplier','transfMatrix','spans'].map(k => [k,section[k]]));

// Diagnostic validation only. Rejection happens before any live mesh is modified.
export function validateRhinoCandidate(candidate, sources) {
    const { identity, ...payload } = candidate;
    if (identity !== sha256(JSON.stringify(payload))) throw Error('Candidate identity mismatch');
    if (candidate.schemaVersion !== 1 || candidate.unit !== 'HTNK' || candidate.representation !== 'section-mesh-v1'
        || !candidate.builderVersion || !candidate.revision || candidate.parts?.length !== 3) throw Error('Incomplete or unsupported family');
    let totalBytes = 0;
    for (const [i,role] of ['body','turret','barrel'].entries()) {
        const p = candidate.parts[i], s = sources[i];
        if (p.role !== role || p.source.sha256 !== s.source.sha256 || p.hva.sha256 !== s.hva.sha256
            || p.section !== s.sections[0].name) throw Error('Source identity mismatch');
        if (JSON.stringify(p.nativeBounds) !== JSON.stringify([s.sections[0].minBounds,s.sections[0].maxBounds])
            || JSON.stringify(p.transforms) !== JSON.stringify(s.sections[0].appliedHva)) throw Error('Transform mismatch');
        if (p.geometrySha256 !== sha256(JSON.stringify(p.geometry))) throw Error('Geometry content mismatch');
        const { attributes, index } = p.geometry;
        if (Object.keys(attributes).sort().join() !== 'color,normal,position') throw Error('Unsupported attributes');
        const count = attributes.position.array.length/3;
        if (!Number.isInteger(count) || count < 3 || count > 100000) throw Error('Vertex limit');
        for (const [key,a] of Object.entries(attributes)) {
            if (a.itemSize !== 3 || a.array.length !== count*3 || !a.array.every(Number.isFinite)) throw Error('Invalid attribute');
            totalBytes += a.array.length*4;
            for (let n=0;n<count;n++) {
                const v=a.array.slice(n*3,n*3+3);
                if (key === 'position' && v.some((x,axis)=>x < p.nativeBounds[0][axis]-1e-5 || x > p.nativeBounds[1][axis]+1e-5))
                    throw Error('Geometry exceeds native bounds');
                if (key === 'normal' && Math.abs(Math.hypot(...v)-1)>1e-5) throw Error('Invalid normal');
                if (key === 'color' && (v[1]!==0 || v[2]!==0 || v[0]<1/255 || v[0]>1
                    || Math.abs(v[0]*255-Math.round(v[0]*255))>1e-4)) throw Error('Invalid palette index');
            }
        }
        if (!['Uint16Array','Uint32Array'].includes(index.type) || index.array.length%3
            || !index.array.every(n=>Number.isInteger(n)&&n>=0&&n<count)) throw Error('Invalid index');
        totalBytes += index.array.length*(index.type==='Uint16Array'?2:4);
    }
    if (totalBytes > 8*1024*1024) throw Error('Geometry resource limit');
    return { identity, totalBytes, cacheKey: `${candidate.unit}:${identity}:${candidate.revision}:${candidate.representation}:${candidate.builderVersion}` };
}
