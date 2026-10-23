import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensurePortableRegistration(profile, resources) {
    await fs.mkdir(profile, { recursive: true });
    const file = path.join(profile, 'resource-registration.json');
    try {
        await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, directory: resources }) + '\n', { flag: 'wx' });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}
