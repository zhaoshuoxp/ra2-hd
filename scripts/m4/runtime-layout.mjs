import assert from 'node:assert/strict';
import path from 'node:path';

export function benchmarkLayout(args, root, paths = path) {
    assert(!(args.app && args['windows-app']), 'Choose one packaged platform');
    const packagedApp = args.app && paths.resolve(args.app);
    const packagedWindowsApp = args['windows-app'] && paths.resolve(args['windows-app']);
    const packaged = Boolean(packagedApp || packagedWindowsApp);
    assert(!(packaged && args.runtime), 'Packaged measurements cannot select a different runtime');
    const runtime = packagedApp ? paths.join(packagedApp, 'Contents/Resources/app')
        : packagedWindowsApp ? paths.join(packagedWindowsApp, 'resources/app') : paths.resolve(args.runtime ?? root);
    const resources = paths.resolve(args.resources ?? (packagedApp
        ? paths.join(packagedApp, 'Contents/Resources/GameResources')
        : packagedWindowsApp ? paths.join(packagedWindowsApp, 'GameResources') : paths.join(root, '.local')));
    const executable = packagedApp ? paths.join(packagedApp, 'Contents/MacOS/RA2 HD Editions')
        : packagedWindowsApp ? paths.join(packagedWindowsApp, 'Red Alert 2 HD.exe') : undefined;
    return { runtime, resources, executable, packaged, packagedApp, packagedWindowsApp };
}
