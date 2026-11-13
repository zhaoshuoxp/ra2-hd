import { renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PREFIX = '[Game error] ';

export function persistGameError(message, directory, metadata = {}) {
    if (typeof message !== 'string' || !message.startsWith(PREFIX) || message.length > 65536) return false;
    let diagnostic;
    try { diagnostic = JSON.parse(message.slice(PREFIX.length)); }
    catch { return false; }
    if (diagnostic?.schema !== 'game-error-v1' || typeof diagnostic.error?.message !== 'string') return false;
    const file = path.join(directory, 'game-error-latest.json');
    writeFileSync(`${file}.tmp`, JSON.stringify({ ...diagnostic, runtime: metadata }, null, 2) + '\n', { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
    return true;
}
