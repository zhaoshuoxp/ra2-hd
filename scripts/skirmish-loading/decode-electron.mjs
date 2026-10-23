import { app, BrowserWindow, protocol } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const root = path.resolve(process.argv[2]);
app.setPath('userData', path.join(root, '.artifacts/skirmish-loading/decoder-profile'));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: 'hdprep', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.whenReady().then(async () => {
    let input;
    protocol.handle('hdprep', async request => new URL(request.url).pathname === '/'
        ? new Response('<!doctype html><title>Offline texture preparation</title>', { headers: { 'Content-Type': 'text/html' } })
        : new Response(await fs.readFile(input), { headers: { 'Content-Type': 'image/png' } }));
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
    await window.loadURL('hdprep://local/');
    const lines = readline.createInterface({ input: process.stdin });
    for await (const line of lines) {
        let request;
        try {
            request = JSON.parse(line);
            input = path.resolve(request.file);
            if (!input.startsWith(path.join(root, '.local') + path.sep)) throw Error('Decode outside isolated resources');
            const output = path.resolve(request.output);
            if (!output.startsWith(path.join(root, '.artifacts/skirmish-loading/decoded-pages') + path.sep))
                throw Error('Decode output outside isolated artifacts');
            const result = await window.webContents.executeJavaScript(`(async () => {
                const response = await fetch('hdprep://local/input.png?${request.id}');
                const bitmap = await createImageBitmap(await response.blob(),
                    { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = bitmap.width; canvas.height = bitmap.height;
                    const context = canvas.getContext('2d', { willReadFrequently: true });
                    context.drawImage(bitmap, 0, 0);
                    return { width: canvas.width, height: canvas.height,
                        pixels: new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data) };
                } finally { bitmap.close(); }
            })()`);
            if (result.pixels.byteLength !== result.width * result.height * 4) throw Error('Decode result layout');
            const header = Buffer.alloc(8);
            header.writeUInt32LE(result.width, 0); header.writeUInt32LE(result.height, 4);
            await fs.writeFile(output, Buffer.concat([header, Buffer.from(result.pixels)]), { flag: 'wx' });
            process.stdout.write(JSON.stringify({ id: request.id, status: 'PASS' }) + '\n');
        } catch (error) { process.stdout.write(JSON.stringify({ id: request?.id, error: error.stack }) + '\n'); }
    }
    app.quit();
}).catch(error => { process.stderr.write(error.stack + '\n'); app.exit(1); });
