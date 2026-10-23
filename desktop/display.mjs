import fs from 'node:fs';
import path from 'node:path';

const sizes = [[1280, 720], [1600, 900], [1920, 1080], [2560, 1440], [3840, 2160]];
export function displayChoices(display) {
    const { scaleFactor: scale, workAreaSize: area, size } = display;
    return [
        ...sizes.filter(([w, h]) => w / scale <= area.width && h / scale + 40 <= area.height)
            .map(([width, height]) => ({ id: `${width}x${height}`, label: `${width} × ${height} (window)`, width, height })),
        { id: 'fullscreen', label: `${Math.round(size.width * scale)} × ${Math.round(size.height * scale)} (full screen)` },
    ];
}
export function installDisplay({ app, screen, ipcMain, getWindow, isGameURL }) {
    const file = path.join(app.getPath('userData'), 'display.json');
    const read = () => {
        const window = getWindow(), display = screen.getDisplayMatching(window.getBounds());
        const [w, h] = window.getContentSize(), scale = display.scaleFactor;
        const width = Math.round(w * scale), height = Math.round(h * scale);
        const choices = displayChoices(display);
        const fullscreen = window.isFullScreen() || !!window.isSimpleFullScreen?.();
        const id = fullscreen ? 'fullscreen' : `${width}x${height}`;
        if (!choices.some(c => c.id === id)) choices.unshift({ id, label: `${width} × ${height} (window)`, width, height });
        return { id, width, height, fullscreen, choices };
    };
    let changing = false;
    const apply = async (id, persist = true) => {
        if (changing) throw Error('A display change is already in progress');
        const window = getWindow(), display = screen.getDisplayMatching(window.getBounds());
        const choice = displayChoices(display).find(c => c.id === id);
        if (!choice) throw Error('Unsupported display resolution');
        changing = true;
        try {
            const fullscreen = id === 'fullscreen';
            if (process.platform === 'darwin' && !window.isFullScreen()) {
                // Use borderless macOS full screen without an asynchronous Spaces transition.
                window.setSimpleFullScreen(fullscreen);
            } else if (window.isFullScreen() !== fullscreen) {
                await new Promise((resolve, reject) => {
                    const event = fullscreen ? 'enter-full-screen' : 'leave-full-screen';
                    const done = () => { clearTimeout(timer); resolve(); };
                    const timer = setTimeout(() => { window.removeListener(event, done); reject(Error('Full screen transition timed out')); }, 6000);
                    window.once(event, done);
                    window.setFullScreen(fullscreen);
                });
            }
            if (!fullscreen) {
                window.setContentSize(Math.round(choice.width / display.scaleFactor), Math.round(choice.height / display.scaleFactor));
                window.center();
            }
            if (persist) {
                fs.writeFileSync(`${file}.tmp`, JSON.stringify({ id }));
                fs.renameSync(`${file}.tmp`, file);
            }
            return read();
        } finally { changing = false; }
    };
    const trusted = event => {
        if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame || !isGameURL(event.senderFrame.url))
            throw Error('Display request denied');
    };
    ipcMain.handle('desktop:display-get', event => { trusted(event); return read(); });
    ipcMain.handle('desktop:display-set', (event, id) => { trusted(event); return apply(id); });
    return {
        restore: async () => {
            try { await apply(JSON.parse(fs.readFileSync(file, 'utf8')).id, false); }
            catch (error) { if (error.code !== 'ENOENT') console.warn('Saved display mode unavailable:', error.message); }
        },
    };
}
