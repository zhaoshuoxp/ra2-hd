import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { safeFile } from './profile.mjs';

const sha = value => /^[a-f0-9]{64}$/.test(value);
const finite = value => Number.isFinite(value) && value > 0;
const formats = { h264: 'video/mp4; codecs="avc1.640028,mp4a.40.2"', vp9: 'video/webm; codecs="vp9,opus"' };
const movieMime = video => video.codec === 'h264' && video.fpsNumerator / video.fpsDenominator > 30
    ? 'video/mp4; codecs="avc1.64002a,mp4a.40.2"' : formats[video.codec];
export function validMovieTimeline(points, originalDuration, mediaDuration) {
    return Array.isArray(points) && points.length >= 2 && points.length <= 512
        && points.every((point, index) => Number.isFinite(point.original) && Number.isFinite(point.media)
            && point.original >= 0 && point.media >= 0 && (!index || point.original > points[index - 1].original
                && point.media > points[index - 1].media))
        && points[0].original === 0 && points[0].media === 0
        && Math.abs(points.at(-1).original - originalDuration) < .1
        && Math.abs(points.at(-1).media - mediaDuration) < .1;
}
export async function registerHdMovieResources(profile, record = () => {}) {
    profile.selections ??= new Map();
    profile.movieIntegrity ??= new Map();
    const entries = [], rejected = [];
    profile.selections.set('/local-hd-movies/catalog.json', { schema: 'registered-hd-movies-v1', entries });
    try {
        const selectionFile = await safeFile(profile.root, 'hd-movie-selection.json');
        const selectionBytes = await fs.readFile(selectionFile);
        if (selectionBytes.length > 4096) throw Error('Oversize movie selection');
        const selection = JSON.parse(selectionBytes);
        if (selection.schema !== 'hd-movie-selection-v1' || !sha(selection.sha256)
            || !/^media\/hd-movies\/[a-z0-9-]+\/manifest\.json$/.test(selection.manifest)) throw Error('Invalid movie selection');
        const manifestFile = await safeFile(profile.root, selection.manifest), bytes = await fs.readFile(manifestFile);
        if (bytes.length > 4 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== selection.sha256) throw Error('HD movie manifest identity differs');
        const manifest = JSON.parse(bytes), revision = selection.manifest.split('/')[2];
        if (manifest.schema !== 'hd-movie-pack-v1' || manifest.revision !== revision
            || !Array.isArray(manifest.entries) || manifest.entries.length > 512) throw Error('Invalid HD movie pack');
        const keys = manifest.entries.map(entry => entry.edition + ':' + entry.id);
        if (new Set(keys).size !== keys.length) throw Error('Duplicate HD movie identity');
        const seen = new Set(), files = new Map();
        for (const entry of manifest.entries) {
            const key = entry.edition + ':' + entry.id;
            try {
                const original = profile.movieIdentities?.get(key), file = entry.file, video = entry.video;
                if (!['ra2', 'yr'].includes(entry.edition) || !/^[a-z0-9_-]{1,80}$/.test(entry.id) || seen.has(key)) throw Error('Duplicate or invalid identity');
                seen.add(key);
                if (!original || entry.original?.sha256 !== original.original.sha256 || entry.original.language !== 'en'
                    || !finite(entry.original.durationSeconds) || Math.abs(entry.original.durationSeconds - original.durationSeconds) > .1) throw Error('Original cut or language does not match');
                if (!/^[a-z0-9_.-]+\.(?:webm|mp4)$/.test(file?.path) || !sha(file.sha256)
                    || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !formats[video?.codec]
                    || (video.codec === 'h264' ? !file.path.endsWith('.mp4') : !file.path.endsWith('.webm'))
                    || !Number.isInteger(video.width) || !Number.isInteger(video.height)
                    || video.width < original.width || video.width > 4096 || video.height < original.height || video.height > 3072
                    || Math.abs(video.width / video.height - original.width / original.height) > .002
                    || !finite(video.durationSeconds) || !finite(video.fpsNumerator) || !finite(video.fpsDenominator)
                    || video.fpsNumerator / video.fpsDenominator > 120) throw Error('Invalid HD movie stream');
                if (entry.audio?.language !== entry.original.language || !['original-remux', 'original-transcode'].includes(entry.audio.strategy)
                    || !sha(entry.audio.sourcePcmSha256) || !sha(entry.audio.decodedPcmSha256)
                    || entry.audio.strategy === 'original-remux' && entry.audio.sourcePcmSha256 !== entry.audio.decodedPcmSha256
                    || !['game', 'none'].includes(entry.subtitles?.strategy) || entry.subtitles.burnedIn !== false
                    || !sha(entry.subtitles.timelineSha256) || entry.acceptance?.technical !== 'verified'
                    || entry.acceptance.visual !== 'accepted' || entry.acceptance.cut !== 'verified'
                    || !Array.isArray(entry.provenance?.sources) || !entry.provenance.sources.length
                    || !validMovieTimeline(entry.timeline, entry.original.durationSeconds, video.durationSeconds)) throw Error('Movie audit or acceptance is incomplete');
                const target = await safeFile(profile.root, path.posix.join(path.posix.dirname(selection.manifest), file.path));
                if ((await fs.stat(target)).size !== file.bytes) throw Error('HD movie size differs');
                const route = `/local-hd-movies/${revision}/${file.path}`;
                if (files.has(route) && files.get(route).sha256 !== file.sha256 || profile.routes.has(route)) throw Error('Conflicting HD movie payload');
                files.set(route, { file: target, bytes: file.bytes, sha256: file.sha256 });
                entries.push({ edition: entry.edition, id: entry.id, original: entry.original,
                    file: { name: file.path, route, bytes: file.bytes, sha256: file.sha256, mime: movieMime(video) },
                    timeline: entry.timeline, subtitles: entry.subtitles });
            } catch (error) { rejected.push({ identity: key, reason: error.message }); }
        }
        for (const [route, file] of files) { profile.routes.set(route, file.file); profile.movieIntegrity.set(route, file); }
        profile.hdMovieFiles = [selectionFile, manifestFile];
        profile.hdMovies = { revision, accepted: entries.length, rejected };
        record({ type: 'hd-movies-registered', ...profile.hdMovies });
        return true;
    } catch (error) {
        record({ type: 'hd-movies-unavailable', reason: error.code === 'ENOENT' ? 'No optional HD movie pack selected' : error.message });
        return false;
    }
}

// Hash only the requested file, using a stream. Recheck after any file mutation.
export async function verifyMovieRoute(profile, route) {
    const identity = profile.movieIntegrity?.get(route);
    if (!identity) return undefined;
    const stat = await fs.stat(identity.file);
    if (!stat.isFile() || stat.size !== identity.bytes) throw Error('Movie identity differs');
    const stamp = [stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino].join(':');
    if (identity.stamp !== stamp) {
        if (identity.pendingStamp !== stamp) {
            identity.pendingStamp = stamp;
            identity.pending = (async () => {
                const hash = createHash('sha256');
                for await (const bytes of createReadStream(identity.file)) hash.update(bytes);
                const after = await fs.stat(identity.file);
                if ([after.size, after.mtimeMs, after.ctimeMs, after.ino].join(':') !== stamp
                    || hash.digest('hex') !== identity.sha256) throw Error('Movie hash differs');
                identity.stamp = stamp;
            })();
        }
        await identity.pending;
    }
    return identity.sha256;
}
