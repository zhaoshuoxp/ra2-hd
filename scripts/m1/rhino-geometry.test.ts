import { test, expect } from 'bun:test';
import { authorRhinoPart } from './rhino-geometry';
import { validateRhinoCandidate, sha256 } from './rhino-candidate-validation.mjs';

function fixture() {
    const sources = (['body','turret','barrel'] as const).map((role,i)=>({
        source:{sha256:String(i).repeat(64)},hva:{sha256:String(i+3).repeat(64)},
        sections:[{name:role,minBounds:[-30,-20,0],maxBounds:[30,20,20],
            sizeX:[46,28,19][i],sizeY:[34,18,3][i],sizeZ:[12,9,3][i],
            normalsMode:2,hvaMultiplier:1,transfMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
            appliedHva:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],spans:[]}],
    }));
    const parts=sources.map((s,i)=>{
        const role=(['body','turret','barrel'] as const)[i],g=authorRhinoPart(role,s.sections[0]);
        const geometry={attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{itemSize:a.itemSize,array:Array.from(a.array)}])),
            index:{type:g.index!.array.constructor.name,array:Array.from(g.index!.array)}};
        return {role,source:s.source,hva:s.hva,section:role,nativeBounds:[s.sections[0].minBounds,s.sections[0].maxBounds],
            transforms:s.sections[0].appliedHva,geometry,geometrySha256:sha256(JSON.stringify(geometry))};
    });
    const candidate:any={unit:'HTNK',schemaVersion:1,revision:'synthetic',representation:'section-mesh-v1',builderVersion:'test',parts:structuredClone(parts)};
    sign(candidate);return {candidate,sources};
}
function sign(c:any) {
    c.parts.forEach(p=>p.geometrySha256=sha256(JSON.stringify(p.geometry)));
    delete c.identity;c.identity=sha256(JSON.stringify(c));
}
test('synthetic complete geometry stays inside native bounds with valid normals and discrete palette data',()=>{
    const {candidate,sources}=fixture();
    const result=validateRhinoCandidate(candidate,sources);
    expect(result.totalBytes).toBeGreaterThan(0);expect(result.totalBytes).toBeLessThan(1024*1024);
    expect(result.cacheKey).toContain(candidate.identity);
    for (const p of candidate.parts) for (let axis=0;axis<3;axis++) {
        const values=p.geometry.attributes.position.array.filter((_,i)=>i%3===axis);
        expect(Math.min(...values)).toBeCloseTo(p.nativeBounds[0][axis],5);
        expect(Math.max(...values)).toBeCloseTo(p.nativeBounds[1][axis],5);
    }
});
test('incomplete, tampered and wrong-source families reject before activation',()=>{
    for(const mutate of [c=>c.parts.pop(),c=>c.parts[1].source.sha256='wrong',c=>c.parts[2].transforms[12]=10]) {
        const {candidate,sources}=fixture();mutate(candidate);sign(candidate);
        expect(()=>validateRhinoCandidate(candidate,sources)).toThrow();
    }
    const {candidate,sources}=fixture();candidate.parts[0].geometry.attributes.position.array[0]+=.5;
    expect(()=>validateRhinoCandidate(candidate,sources)).toThrow('identity');
});
test('oversized bounds, invalid normals, palette interpolation and broken indices reject',()=>{
    for (const mutate of [g=>g.attributes.position.array[0]=100,g=>g.attributes.normal.array[0]=10,
        g=>g.attributes.color.array[0]=.12345,g=>g.index.array[0]=999999]) {
        const {candidate,sources}=fixture();mutate(candidate.parts[0].geometry);sign(candidate);
        expect(()=>validateRhinoCandidate(candidate,sources)).toThrow();
    }
});
