// Fast equivalent of @ra2web/wavefile's mono IMA ADPCM -> 16-bit PCM WAV path.
// The library decodes into growing number arrays and packs every sample through
// a generic byte codec on the main thread. This port keeps its exact block,
// clamping and coercion rules (including malformed headers) and writes the
// same RIFF/fmt/data layout, so the produced bytes are identical.

const INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const STEP_TABLE = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41,
    45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190,
    209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
    876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
    2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845,
    8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385,
    24623, 27086, 29794, 32767,
];

// Mirrors the library's per-block decoder. Header fields are read from the
// current (possibly short) block, so out-of-range bytes stay undefined and
// propagate through JavaScript coercion exactly as before.
export function decodeImaAdpcmBlocks(input: Uint8Array, blockSize = 256): Int16Array {
    const output = new Int16Array(2 * input.length);
    let written = 0;
    for (let offset = 0, remaining = input.length; remaining > 0; offset += blockSize, remaining -= blockSize) {
        const length = Math.min(remaining, blockSize);
        const at = (index: number): any => index < length ? input[offset + index] : undefined;
        const word = (at(1) << 8) | at(0);
        let sample: any = word > 32767 ? word - 65536 : word;
        let index: any = at(2);
        let step: any = (STEP_TABLE as any)[index];
        output[written++] = sample;
        for (let position = offset + 4, end = offset + length; position < end; position++) {
            const byte = input[position];
            for (let nibble = byte & 15, half = 0; half < 2; half++, nibble = byte >> 4) {
                let delta: any = 0;
                if (nibble & 4) delta += step;
                if (nibble & 2) delta += step >> 1;
                if (nibble & 1) delta += step >> 2;
                delta += step >> 3;
                if (nibble & 8) delta = -delta;
                sample += delta;
                if (sample > 32767) sample = 32767;
                else if (sample < -32768) sample = -32768;
                index += INDEX_TABLE[nibble];
                if (index < 0) index = 0;
                else if (index > 88) index = 88;
                step = (STEP_TABLE as any)[index];
                output[written++] = sample;
            }
        }
    }
    return output.slice(0, written);
}

function ascii(target: Uint8Array, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) target[offset + i] = text.charCodeAt(i);
}

// The library rewrites a decoded mono file as plain little-endian PCM:
// RIFF size, a 16-byte fmt chunk and the data chunk, with no padding byte.
export function mono16BitWav(samples: Int16Array, sampleRate: number): Uint8Array {
    const dataBytes = samples.length * 2, output = new Uint8Array(44 + dataBytes);
    const view = new DataView(output.buffer);
    ascii(output, 0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); ascii(output, 8, 'WAVE');
    ascii(output, 12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(output, 36, 'data'); view.setUint32(40, dataBytes, true);
    for (let i = 0, offset = 44; i < samples.length; i++, offset += 2) view.setInt16(offset, samples[i], true);
    return output;
}

interface ParsedWave {
    container: string;
    fmt: { numChannels: number; sampleRate: number; blockAlign: number };
    data: { samples: Uint8Array };
    cue: { chunkId: string }; smpl: { chunkId: string }; bext: { chunkId: string };
    iXML: { chunkId: string }; junk: { chunkId: string }; _PMX: { chunkId: string };
    LIST: unknown[];
}

// Only the plain mono layout produced by audio bags uses the fast path. Every
// other file keeps the library implementation and its chunk handling.
export function fastMonoImaAdpcmWav(wave: ParsedWave): Uint8Array | undefined {
    const { fmt } = wave;
    if (wave.container !== 'RIFF' || fmt.numChannels !== 1 || !Number.isInteger(fmt.blockAlign) || fmt.blockAlign < 1
        || !Number.isInteger(fmt.sampleRate) || fmt.sampleRate < 1 || fmt.sampleRate * 2 > 4294967295
        || wave.cue.chunkId || wave.smpl.chunkId || wave.bext.chunkId || wave.iXML.chunkId
        || wave.junk.chunkId || wave._PMX.chunkId || wave.LIST.length) return undefined;
    return mono16BitWav(decodeImaAdpcmBlocks(wave.data.samples, fmt.blockAlign), fmt.sampleRate);
}
