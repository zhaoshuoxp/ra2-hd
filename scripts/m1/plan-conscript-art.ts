import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const raw = JSON.parse(readFileSync('.artifacts/m1-1/conscript-source.json', 'utf8'));
const visibleCount = raw.frames.length / 2;
const membership = Array.from({ length: visibleCount }, () => [] as string[]);
const sequences = Object.entries(raw.sequences).map(([name, value]) => {
    const [start, count, stride] = String(value).split(',').map(Number);
    const directions = stride ? 8 : 1;
    const frames = new Set<number>();
    for (let facing = 0; facing < directions; facing++) for (let phase = 0; phase < count; phase++) {
        const index = start + facing * stride + phase;
        if (!Number.isInteger(index) || index < 0 || index >= visibleCount) throw new Error(`Invalid ${name} frame ${index}`);
        frames.add(index);
    }
    for (const frame of frames) membership[frame].push(name);
    return { name, start, count, stride, directions, frames: [...frames] };
});
const groups = [
    ['standing', 0, 7], ['walking', 8, 55], ['idle-one', 56, 70], ['idle-two', 71, 84],
    ['unreferenced-native-frame', 85, 85], ['crawl-and-prone', 86, 133], ['death-one', 134, 148],
    ['death-two', 149, 163], ['standing-fire', 164, 211], ['prone-fire', 212, 259],
    ['go-prone', 260, 275], ['stand-up', 276, 291], ['paradrop', 292, 292], ['cheer', 293, 300],
] as const;
const covered = new Set<number>();
const batches = groups.map(([name, first, last]) => {
    const frames = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    for (const frame of frames) {
        if (covered.has(frame)) throw new Error(`Repeated frame ${frame}`);
        covered.add(frame);
    }
    return { name, frames, status: 'not-authored', activation: 'forbidden-until-complete-member-and-art-review' };
});
if (covered.size !== visibleCount || visibleCount !== 301) throw new Error('Unexpected Conscript coverage');
const plan = {
    schemaVersion: 1, kind: 'authoring-plan-not-an-asset-pack', source: raw.source,
    approvedStyle: 'art-review-v1/conscript-samples-v3.png; user accepted direction and metallic falling ammunition',
    approvedStyleSha256: createHash('sha256').update(readFileSync('.artifacts/m1-1/art-review-v1/conscript-samples-v3.png')).digest('hex'),
    targetDensity: 2, visibleFrames: visibleCount, originalShadowFrames: visibleCount,
    representativeFrames: [0, 2, 8, 11, 164, 167],
    gates: ['transparent-frame-bounds-and-anchor', 'complete-authored-301-frame-member', 'complete-art-review',
        'actual-match-native-size-team-color-shadow-action-selection-occlusion'],
    sequences, batches,
    unreferencedFrames: membership.flatMap((names, index) => names.length ? [] : [index]),
    frameMetadata: raw.frames.slice(0, visibleCount).map(frame => ({ nativeFrame: frame.nativeFrame,
        trimOrigin: [frame.x, frame.y], trimSize: [frame.width, frame.height],
        legacyRenderSize: [frame.width + frame.width % 2, frame.height + frame.height % 2],
        sequences: membership[frame.nativeFrame], empty: !frame.pixels.some(Boolean) })),
};
mkdirSync('.artifacts/m1-1/art-production-probe', { recursive: true });
writeFileSync('.artifacts/m1-1/art-production-probe/production-plan.json', JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ visibleFrames: visibleCount, groups: batches.length,
    unreferencedFrames: plan.unreferencedFrames, emptyFrames: plan.frameMetadata.filter(f => f.empty).map(f => f.nativeFrame) }));
