import type { HdSource } from './resolveHdSprite';

// Source approval alone does not register or activate a resource pack.
const sources = [
    { member: 'gi.shp', sourceHash: 'bceaee9c270d6382d80d509f2c4b2893c10565f779096b3add37a4d5321e8be1',
        frames: 372, canvas: [78, 66] },
    { member: 'rock.shp', sourceHash: '3a7fd6cf0723ab06ee7b6d989233e1dc49288a8aaeebcc84cdb8f6ad1ead4525',
        frames: 427, canvas: [94, 120] },
    { member: 'cleg.shp', sourceHash: 'bd0c5225cdf12601392eea393249861dfff699ad8bbce5f20effaf3afe492539',
        frames: 173, canvas: [74, 88] },
    { member: 'spy.shp', sourceHash: '6d7eb5a0ebd9795fcf4a82208ea154a39f615fd0df8732174095513f3f52710e',
        frames: 204, canvas: [86, 86] },
    { member: 'snipe.shp', sourceHash: '63efb2566adb05586ec96e7a65845f5c97cce46d0678be9e4cf965490858437b',
        frames: 301, canvas: [112, 82] },
    { member: 'tany.shp', sourceHash: 'a7ad3cecbfa4765774b9b6e72d69854ab997ae9a748f990ad7d23fc292b42feb',
        frames: 619, canvas: [130, 110] },
    { member: 'adog.shp', sourceHash: '020c4ee87b55409f72bf1d15482f6ae7c7dc794bc8ecf172e2e0f80d133258b7',
        frames: 172, canvas: [74, 72] },
    { member: 'adogp.shp', sourceHash: 'fba7506842bdb4f12fae6c500a2ef4393a3ec631a26372cafdcbf335b4bb5d44',
        frames: 32, canvas: [74, 72] },
    { member: 'dlph.shp', sourceHash: 'e59b3a3f6518dd71c7de042ae4becbcdcbe0a6977700f8fb1e719e12b6ea6a0c',
        frames: 116, canvas: [74, 158] },
    { member: 'seala.shp', sourceHash: '213d3bc3c59b412c7c2391bcb52757e0a51f39ee5248590a80f36e1141a6e9c1',
        frames: 619, canvas: [118, 72] },
    { member: 'ggi.shp', sourceHash: '736bb542838bb62e556f9fabdf26b2ac2bd49068e35228d836fe8eac44fa7744',
        frames: 372, canvas: [94, 78] },
];

export function isAlliedUnitHdSource(source: HdSource): boolean {
    return source.theater === 'TEMPERATE' && sources.some(member =>
        source.member === member.member && source.sha256 === member.sourceHash
        && source.frames.length === member.frames
        && source.canvas[0] === member.canvas[0] && source.canvas[1] === member.canvas[1]);
}
