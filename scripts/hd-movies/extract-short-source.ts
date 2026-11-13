// A bounded raw-source sample; never install or overwrite a retail movie.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseMix } from '../../src/offline/retail';

const [identity, frameArgument, countArgument, outArgument] = process.argv.slice(2);
const startFrame = Number(frameArgument), count = Number(countArgument), out = path.resolve(outArgument);
if (!/^(ra2|yr):[a-z0-9_-]+$/.test(identity) || !Number.isInteger(startFrame) || startFrame < 0
    || !Number.isInteger(count) || count < 2 || count > 60) throw Error('Use one 2-60 frame sample');
await fs.mkdir(path.dirname(out), { recursive: true }); await fs.mkdir(out, { recursive: false });
const root = path.resolve(import.meta.dir, '../..');
const inventory = JSON.parse(await fs.readFile(path.join(root, 'docs/hd-movies-inventory-20261109.json'), 'utf8'));
const movie = inventory.movies.find((movie: any) => movie.identity === identity);
if (!movie || startFrame + count > movie.original.video.frames) throw Error('Sample is outside the source movie');
const archiveName = movie.original.archiveNames[0];
const installation = path.resolve(root, '../Resource/Command and Conquer Red Alert II');
const actualName = (await fs.readdir(installation)).find(name => name.toLowerCase() === archiveName);
if (!actualName) throw Error('Original archive is missing');
const archiveBytes = await fs.readFile(path.join(installation, actualName));
const bytes = parseMix(archiveBytes).openFile(movie.original.member).getBytes();
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
if (sha(bytes) !== movie.original.sha256) throw Error('Original BIK identity differs');
const temporary = path.join(out, 'source-temporary.bik');
await fs.writeFile(temporary, bytes, { flag: 'wx' });
const converter = process.env.RA2_CAMPAIGN_FFMPEG ?? execFileSync(path.join(root, '.local/tooling/campaign-media/bin/python'),
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const video = movie.original.video, fps = video.fpsNumerator / video.fpsDenominator;
try {
    execFileSync(converter, ['-nostdin', '-n', '-v', 'error', '-ss', String(startFrame / fps), '-i', temporary,
        '-map', '0:v:0', '-frames:v', String(count), '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', path.join(out, 'input.rgb'),
        '-map', '0:a:0', '-t', String(count / fps), '-c:a', 'pcm_s16le', path.join(out, 'source-audio.wav')]);
} finally { await fs.unlink(temporary); }
if ((await fs.stat(path.join(out, 'input.rgb'))).size !== count * video.width * video.height * 3) throw Error('Decoded sample frame count differs');
execFileSync(converter, ['-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
    '-video_size', `${video.width}x${video.height}`, '-framerate', String(fps), '-i', path.join(out, 'input.rgb'),
    '-i', path.join(out, 'source-audio.wav'), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-crf', '18',
    '-vf', 'scale=iw:ih:out_color_matrix=bt601:out_range=tv,setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m',
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', path.join(out, 'original.mp4')]);
await fs.writeFile(path.join(out, 'source.json'), JSON.stringify({ schema: 'hd-movie-short-source-v1', identity,
    original: movie.original, startFrame, frames: count, width: video.width, height: video.height, fps,
    seconds: count / fps, sourceSha256: movie.original.sha256, inputSha256: sha(await fs.readFile(path.join(out, 'input.rgb'))),
    audioPolicy: 'Decode original local BIK audio to PCM once; encode preview AAC once and remux the identical packets into candidates',
    colorPolicy: 'BT.601 limited-range conversion; SMPTE170M matrix/primaries and BT709 transfer at every output size',
    acceptance: 'REPRESENTATIVE_SAMPLE_ONLY_NOT_A_COMPLETE_HD_MOVIE' }, null, 2) + '\n');
console.log(JSON.stringify({ identity, startFrame, frames: count, out }));
