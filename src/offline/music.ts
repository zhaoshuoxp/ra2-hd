import { Mp3File } from '../data/Mp3File';
import contract from '../../desktop/music-contract.json';
import yrContract from '../../desktop/music-yr-contract.json';
import type { GameEdition } from '../editions/GameEdition';

async function digest(bytes: ArrayBuffer): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadPreparedLocalMusic(edition: GameEdition = 'ra2'): Promise<{ get(filename: string): Promise<Mp3File> } | undefined> {
    const selected = edition === 'yr' ? yrContract : contract;
    const response = await fetch(`/local-music/${edition}/manifest.json`);
    if (response.status === 404) return;
    if (!response.ok) throw new Error('Original music manifest is unavailable');
    const bytes = await response.arrayBuffer();
    if (await digest(bytes) !== selected.manifestSha256) throw new Error('Original music manifest identity mismatch');
    return { async get(filename: string): Promise<Mp3File> {
        const entry = selected.files.find(file => file.name === filename.toLowerCase());
        if (!entry) throw new Error(`Original music track is not prepared: ${filename}`);
        const response = await fetch(`/local-music/${edition}/` + entry.name);
        if (!response.ok) throw new Error(`Original music track is unavailable: ${entry.name}`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== entry.bytes || await digest(bytes) !== entry.sha256) throw new Error(`Original music track identity mismatch: ${entry.name}`);
        // Keep compressed tracks lazy and uncached, like the existing theme
        // collection. The audio element owns only its current playback URL.
        return new Mp3File(new Blob([bytes], { type: 'audio/mpeg' }), entry.name);
    } };
}
