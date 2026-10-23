import fs from 'node:fs/promises';
import path from 'node:path';

export function distributionCandidates(resourcesPath, userData, platform = process.platform) {
    const paths = platform === 'win32' ? path.win32 : path.posix;
    return [...new Set([
        paths.join(resourcesPath, 'GameResources'),
        paths.join(userData, 'GameResources'),
        paths.resolve(resourcesPath, platform === 'darwin' ? '../../..' : '..', 'GameResources'),
    ])];
}

export async function discoverDistributionResources(candidates) {
    for (const directory of candidates) {
        try { await fs.access(directory); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        for (const name of ['ra2-core-manifest.json', 'ui-selection.json']) {
            if (!(await fs.stat(path.join(directory, name))).isFile()) {
                throw Error(`Incomplete GameResources: ${name}`);
            }
        }
        return fs.realpath(directory);
    }
    return undefined;
}

export async function registerDistributionResources(userData, directory) {
    if (!directory) return;
    await fs.mkdir(userData, { recursive: true });
    const file = path.join(userData, 'resource-registration.json');
    const value = JSON.stringify({ schemaVersion: 1, directory }) + '\n';
    // Refresh a relocated app's binding without replacing settings or saves.
    if (await fs.readFile(file, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
    }) === value) return;
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, value, { flag: 'wx' });
    try { await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }); }
}
