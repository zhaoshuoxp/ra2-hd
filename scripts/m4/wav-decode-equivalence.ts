// Compare the fast mono IMA ADPCM decoder with the original wavefile path for
// every sound in the selected retail audio bags, plus malformed synthetic input.
// Usage: bun scripts/m4/wav-decode-equivalence.ts [resourceRoot] [report.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseMix, retailTree, resolveMember, type Container } from '../../src/offline/retail';
import { MixFile } from '../../src/data/MixFile';
import { IdxFile } from '../../src/data/IdxFile';
import { AudioBagFile } from '../../src/data/AudioBagFile';
import { decodeWavData, decodeWavDataReference } from '../../src/data/WavFile';

const root = path.resolve(process.argv[2] ?? '.local');
const reportFile = process.argv[3] && path.resolve(process.argv[3]);
const read = (relative: string) => new Uint8Array(readFileSync(path.join(root, relative)));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function bagFrom(tree: Container[], bag: string, idx: string) {
    const audio = new AudioBagFile();
    return audio.fromVirtualFile(resolveMember(tree, bag).file, new IdxFile(resolveMember(tree, idx).file.stream)).then(() => audio);
}

const ra2Tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name => [name, read(`assets/ra2/${name}`)])));
const yrTree: Container[] = [];
for (const name of ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']) {
    const visit = (label: string, mix: MixFile, depth: number) => {
        yrTree.push({ path: label, mix });
        if (depth < 3 && mix.containsFile('audiomd.mix')) visit(label + '/audiomd.mix', new MixFile(mix.openFile('audiomd.mix').stream), depth + 1);
    };
    visit(name, parseMix(read(`assets/yr/${name}`), name), 0);
}
const sources = [
    { edition: 'ra2', bag: await bagFrom(ra2Tree, 'audio.bag', 'audio.idx') },
    { edition: 'yr', bag: await bagFrom(yrTree, 'audio.bag', 'audio.idx') },
];
const report: any = { schema: 'm4-wav-decode-equivalence-v1', root, editions: [], synthetic: [], mismatches: [] };
let referenceMs = 0, fastMs = 0;
for (const { edition, bag } of sources) {
    const row = { edition, files: 0, imaMono: 0, otherLayouts: 0, decodedBytes: 0, digest: createHash('sha256') };
    for (const name of bag.getFileList().sort()) {
        const raw = bag.openFile(name).getBytes();
        const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const isIma = view.getUint16(20, true) === 17, channels = view.getUint16(22, true);
        let at = performance.now();
        const expected = decodeWavDataReference(raw.slice());
        referenceMs += performance.now() - at; at = performance.now();
        const actual = decodeWavData(raw.slice());
        fastMs += performance.now() - at;
        row.files++; if (isIma && channels === 1) row.imaMono++; else row.otherLayouts++;
        row.decodedBytes += actual.length; row.digest.update(actual);
        if (hash(expected) !== hash(actual)) report.mismatches.push({ edition, name, expected: expected.length, actual: actual.length });
    }
    report.editions.push({ ...row, digest: row.digest.digest('hex') });
}
// Malformed and boundary blocks keep the library's coercion behaviour.
function syntheticWav(data: Uint8Array, blockAlign: number, channels = 1) {
    const out = new Uint8Array(60 + data.length), v = new DataView(out.buffer);
    const put = (o: number, s: string) => [...s].forEach((c, i) => out[o + i] = c.charCodeAt(0));
    put(0, 'RIFF'); v.setUint32(4, 52 + data.length, true); put(8, 'WAVE'); put(12, 'fmt '); v.setUint32(16, 20, true);
    v.setUint16(20, 17, true); v.setUint16(22, channels, true); v.setUint32(24, 22050, true); v.setUint32(28, 11100, true);
    v.setUint16(32, blockAlign, true); v.setUint16(34, 4, true); v.setUint16(36, 2, true); v.setUint16(38, 1017, true);
    put(40, 'fact'); v.setUint32(44, 4, true); v.setUint32(48, 1017, true); put(52, 'data'); v.setUint32(56, data.length, true);
    out.set(data, 60); return out;
}
let seed = 0x4d342e32;
const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 255;
const cases = [
    ['partial-final-block', Uint8Array.from({ length: 1000 }, random), 512],
    ['index-above-table', Uint8Array.from([0x10, 0x80, 120, 0, ...Array.from({ length: 60 }, random)]), 64],
    ['one-byte-tail', Uint8Array.from({ length: 513 }, random), 512],
    ['three-byte-tail', Uint8Array.from({ length: 515 }, random), 512],
    ['clamp-extremes', Uint8Array.from([0xff, 0x7f, 88, 0, ...Array(200).fill(0x77), 0x00, 0x80, 88, 0, ...Array(200).fill(0xff)]), 204],
    ['empty', new Uint8Array(0), 512],
] as const;
for (const [label, data, blockAlign] of cases) {
    const input = syntheticWav(data as Uint8Array, blockAlign);
    const expected = decodeWavDataReference(input.slice()), actual = decodeWavData(input.slice());
    const same = hash(expected) === hash(actual);
    report.synthetic.push({ label, bytes: (data as Uint8Array).length, blockAlign, same });
    if (!same) report.mismatches.push({ synthetic: label });
}
report.timing = { referenceMs, fastMs, note: 'Bun host timing over all retail sounds; not an in-game measurement.' };
report.status = report.mismatches.length ? 'FAIL' : 'PASS';
console.log(JSON.stringify(report, null, 2));
if (reportFile) writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
if (report.mismatches.length) process.exitCode = 1;
