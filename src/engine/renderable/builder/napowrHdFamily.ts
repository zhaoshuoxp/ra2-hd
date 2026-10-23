import type { HdSource } from './resolveHdSprite';

// Verified staged retail identities. This inventory does not activate an override.
export const napowrHdFamily = {
    name: 'NAPOWR',
    theater: 'TEMPERATE',
    canvas: [210, 140],
    members: [
        { member: 'ngpowr.shp', frames: 3, aggregateOffset: 0,
            sha256: '7030206e7d9a740bb61852850449040b83c18a29888fb22926bf5e3304af9797' },
        { member: 'ngpowr_a.shp', frames: 38, aggregateOffset: 3,
            sha256: '6183c17408f0b81037b099b0619eff6d4afa914f3bea3b6d38c437d99bc914d1' },
        { member: 'ntpowrmk.shp', frames: 26, aggregateOffset: 79,
            sha256: '4eb96ebbb43abb1d8340850248e8e1bc5294da3b1f13fe81be5bc359c49a649d' },
    ],
} as const;

export function matchesNapowrHdSources(sources: readonly HdSource[]): boolean {
    if (sources.length !== napowrHdFamily.members.length) return false;
    const members = new Map(sources.map(source => [source.member, source]));
    if (members.size !== sources.length) return false;
    return napowrHdFamily.members.every(expected => {
        const source = members.get(expected.member);
        return source?.theater === napowrHdFamily.theater
            && source.sha256 === expected.sha256
            && source.canvas.length === 2
            && source.canvas.every((size, i) => size === napowrHdFamily.canvas[i])
            && source.frames.length === expected.frames
            && source.frames.every((frame, i) => frame.nativeFrame === i);
    });
}
