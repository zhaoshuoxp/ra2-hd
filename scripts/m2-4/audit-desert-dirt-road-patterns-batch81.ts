// Compare untouched indexed road patterns and depth independently of HD colors.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
const root = '.artifacts/m2-4/desert-dirt-roads-batch81-20261019';
const prep = JSON.parse(readFileSync(root+'/preparation-v1.json', 'utf8'));
const guide = JSON.parse(readFileSync(prep.nativeRoot+'/source.json', 'utf8'));
const sha = (b: Uint8Array | undefined) => b ? createHash('sha256').update(b).digest('hex') : null;
const rows = [];
for (const row of prep.rows) {
    const source = guide.sources.find((s: any) => s.member === row.member);
    const target = new TmpFile(VirtualFile.fromBytes(readFileSync(prep.nativeRoot+'/native/'+source.nativeFile), row.member));
    const donor = new TmpFile(VirtualFile.fromBytes(readFileSync(root+'/temperate-native/'+row.donorMember+'/source.tmp'), row.donorMember));
    const frames = row.images.filter((i: any) => i.targetNativePointer > 0).map((i: any) => {
        const a = target.images[i.subTile], b = donor.images[i.subTile];
        return { slot: i.subTile, indexedPatternExact: sha(a.tileData) === sha(b.tileData),
            depthExact: sha(a.zData) === sha(b.zData), extraPatternExact: sha(a.extraData) === sha(b.extraData) };
    });
    rows.push({ member: row.member, frames });
}
const frames = rows.flatMap(r => r.frames);
assert.equal(frames.length, 521);
writeFileSync(root+'/native-pattern-audit-v1.json', JSON.stringify({
    status: 'READ_ONLY_ORIGINAL_INDEXED_PATTERN_AND_DEPTH_COMPARISON', rows,
    actualFrames: frames.length, indexedPatternsExact: frames.filter(f => f.indexedPatternExact).length,
    depthExact: frames.filter(f => f.depthExact).length,
    extraPatternsExact: frames.filter(f => f.extraPatternExact).length,
    newArtworkClaim: false, sourceMapsChanged: false,
}, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify({ frames: frames.length, indexedPatternsExact: frames.filter(f => f.indexedPatternExact).length,
    depthExact: frames.filter(f => f.depthExact).length, extraExact: frames.filter(f => f.extraPatternExact).length }));
