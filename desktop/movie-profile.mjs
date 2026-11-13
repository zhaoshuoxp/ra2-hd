import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export async function registerMovieResources(profile, record = () => {}, campaignDirectory = profile.campaignRoot ?? path.join(profile.root, 'campaign')) {
    const catalogFile = path.join(profile.root, 'media/movie-library-v51/catalog.json');
    try {
        if (await fs.realpath(catalogFile) !== catalogFile || (await fs.stat(catalogFile)).size > 4 * 1024 * 1024) throw Error('Unsafe movie catalog');
        const catalogBytes = await fs.readFile(catalogFile), catalog = JSON.parse(catalogBytes);
        if (catalog.schema !== 'original-movie-library-v1' || !Array.isArray(catalog.entries)
            || !catalog.entries.length || catalog.entries.length > 512) throw Error('Invalid movie catalog');
        const routes = new Map([['/local-movies/catalog.json', catalogFile]]), ids = new Set();
        for (const entry of catalog.entries) {
            const file = entry.file, key = entry.edition + ':' + entry.id;
            if (!['ra2', 'yr'].includes(entry.edition) || !/^[a-z0-9_-]{1,80}$/.test(entry.id) || ids.has(key)
                || !/^[a-f0-9]{64}$/.test(entry.original?.sha256) || entry.fallback !== 'converted-original'
                || !Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0 || entry.durationSeconds > 7200
                || !Number.isInteger(entry.width) || !Number.isInteger(entry.height) || entry.width < 1 || entry.width > 4096
                || entry.height < 1 || entry.height > 4096 || !Number.isSafeInteger(file?.bytes) || file.bytes <= 0
                || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('Invalid original movie entry');
            ids.add(key);
            let target;
            if (/^\/local-movies\/[a-z0-9_-]+\.webm$/.test(file.route)) {
                target = path.join(profile.root, 'media/movie-library-v51', path.basename(file.route));
            } else if (/^\/local-campaign\/ra2\/(?:sov|all|trn)\d{2}[tsu]\/[a-z0-9_.-]+\.webm$/.test(file.route)) {
                target = path.join(campaignDirectory, ...file.route.split('/').slice(2));
            } else throw Error('Unsafe movie route');
            if (path.basename(target) !== file.name || await fs.realpath(target) !== target
                || !(await fs.stat(target)).isFile() || (await fs.stat(target)).size !== file.bytes) throw Error('Movie file identity mismatch');
            const digest = createHash('sha256');
            for await (const bytes of createReadStream(target)) digest.update(bytes);
            if (digest.digest('hex') !== file.sha256) throw Error('Movie payload hash mismatch');
            if (routes.has(file.route) && routes.get(file.route) !== target) throw Error('Conflicting movie route');
            routes.set(file.route, target);
        }
        for (const edition of ['ra2', 'yr']) if (!catalog.entries.some(entry => entry.edition === edition && entry.role === 'introduction')) {
            throw Error('Edition introduction is unavailable');
        }
        for (const [route, file] of routes) {
            if (profile.routes.has(route) && profile.routes.get(route) !== file) throw Error('Movie route conflicts with selected resources');
        }
        const identities = new Map(catalog.entries.map(entry => [entry.edition + ':' + entry.id, entry]));
        const integrity = new Map(catalog.entries.map(entry => [entry.file.route, {
            file: routes.get(entry.file.route), bytes: entry.file.bytes, sha256: entry.file.sha256,
        }]));
        for (const manifest of profile.selections?.values() ?? []) {
            if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.media) || !Array.isArray(manifest.files)) continue;
            for (const movie of manifest.media) {
                const original = identities.get(manifest.edition + ':' + movie.name.toLowerCase());
                const entry = manifest.files.find(entry => entry.name === movie.file);
                const file = entry && profile.routes.get(entry.route);
                if (!original || movie.sha256 !== original.original.sha256 || !file) throw Error('Campaign movie identity differs from original library');
                if (integrity.has(entry.route) && integrity.get(entry.route).sha256 !== entry.sha256) throw Error('Conflicting campaign movie integrity');
                integrity.set(entry.route, { file, bytes: entry.bytes, sha256: entry.sha256 });
            }
        }
        for (const [route, file] of routes) profile.routes.set(route, file);
        profile.movieIdentities = identities;
        profile.movieIntegrity = integrity;
        profile.movieLibrary = { revision: catalog.revision, entries: catalog.entries.length,
            sha256: createHash('sha256').update(catalogBytes).digest('hex') };
        record({ type: 'movie-library-registered', ...profile.movieLibrary }); return true;
    } catch (error) {
        record({ type: 'movie-library-unavailable', reason: error.message }); return false;
    }
}
