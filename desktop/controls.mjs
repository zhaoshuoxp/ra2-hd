import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WindowsCursor } from './windows-cursor.mjs';
const execute = promisify(execFile);

export function pointerScreenPoint(bounds, point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
        || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw Error('Invalid cursor position');
    return { x: bounds.x + Math.min(bounds.width - 1, Math.round(point.x * bounds.width)),
        y: bounds.y + Math.min(bounds.height - 1, Math.round(point.y * bounds.height)) };
}
export function installControls({ app, ipcMain, getWindow, isGameURL, cursorHelper, screen,
    platform = process.platform, windowsCursor = platform === 'win32' ? new WindowsCursor() : undefined }) {
    let handoff = 0;
    app.once?.('will-quit', () => windowsCursor?.dispose());
    const trusted = event => {
        const window = getWindow();
        if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame
            || !isGameURL(event.senderFrame.url)) throw Error('Desktop control request denied');
        return window;
    };
    ipcMain.handle('desktop:quit', event => {
        trusted(event);
        setImmediate(() => app.quit());
    });
    ipcMain.handle('desktop:prepare-pointer', event => {
        trusted(event); handoff++;
        windowsCursor?.prepare().catch(error => console.error('Could not prepare the menu cursor', error));
    });
    ipcMain.handle('desktop:restore-pointer', async (event, normalized) => {
        const window = trusted(event);
        const token = ++handoff;
        const allowed = () => token === handoff && window === getWindow() && !window.isDestroyed() && window.isFocused();
        if (!allowed()) return { restored: false };
        const point = pointerScreenPoint(window.getContentBounds(), normalized);
        if (platform === 'win32') return { restored: await windowsCursor.restore(screen.dipToScreenPoint(point), allowed) };
        if (platform !== 'darwin') return { restored: false };
        await execute(cursorHelper, [String(point.x), String(point.y)], { timeout: 1500 });
        return { restored: true };
    });
}
