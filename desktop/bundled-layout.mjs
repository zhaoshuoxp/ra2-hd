import path from 'node:path';

export function bundledDirectory(appRoot, name, platform = process.platform) {
    const paths = platform === 'win32' ? path.win32 : path.posix;
    return paths.resolve(appRoot, platform === 'darwin' ? '../../../..' : '../..', name);
}
