import { app, BrowserWindow, protocol, session, ipcMain, dialog, Menu, screen } from 'electron';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledDirectory } from './bundled-layout.mjs';
import { installDisplay } from './display.mjs';
import { installControls } from './controls.mjs';
import { registerHdResourcesWhenReady } from './hd-startup.mjs';
import { validateProfile } from './profile.mjs';
import { createHandler } from './protocol.mjs';
import { isGameURL, isLocalRequest } from './url-policy.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageMetadata = JSON.parse(await fs.readFile(path.join(appRoot, 'package.json'), 'utf8'));
const unified = packageMetadata.name === 'ra2-hd-unified-desktop';
const environmentReview = unified && packageMetadata.reviewMilestone === 'M2.1-TEMPERATE';
const editionRevision = packageMetadata.reviewMilestone?.match(/^DUAL-EDITION-(R[12345])$/)?.[1];
const trainerReview = unified && packageMetadata.reviewMilestone === 'OFFLINE-TRAINER-R1';
const yrUnitReview = unified && packageMetadata.reviewMilestone === 'M1.7-YR-R1';
const yuriUnitReview = unified && packageMetadata.reviewMilestone === 'YURI-UNITS-D-R1';
const editionReview = unified && (!!editionRevision || yrUnitReview || trainerReview || yuriUnitReview || environmentReview);
const buildingCoverageReview = unified && packageMetadata.reviewMilestone === 'M1.6C';
const uiReview = unified && packageMetadata.reviewMilestone === 'M1.8-UI';
const napowrReview = unified && packageMetadata.reviewMilestone === 'M1.6a';
const sovietBatchReview = unified && packageMetadata.reviewMilestone === 'M1.6b';
const sovietUnitReview = unified && packageMetadata.reviewMilestone === 'M1.7';
const sovietBatchR2 = unified && packageMetadata.reviewMilestone === 'M1.6b-R2';
const sovietCompleteReview = unified && ['SOVIET-BUILDINGS-R1', 'SOVIET-BUILDINGS-R2', 'SOVIET-BUILDINGS-R3', 'SOVIET-BUILDINGS-R4'].includes(packageMetadata.reviewMilestone);
const sovietRevision = packageMetadata.reviewMilestone?.match(/^SOVIET-BUILDINGS-(R[12345])$/)?.[1] ?? 'R1';
const profileName = environmentReview ? 'RA2 HD M2.1 Temperate' : yuriUnitReview ? 'RA2 HD Yuri Units D R1' : trainerReview ? 'RA2 HD Offline Trainer R1' : yrUnitReview ? 'RA2 HD YR Soviet Units R1' : buildingCoverageReview ? 'RA2 HD Soviet Buildings M1.6C R1' : editionReview ? `RA2 HD Dual Edition ${editionRevision}` : sovietUnitReview ? 'RA2 HD M1.7' : uiReview ? 'RA2 HD UI M1.8' : sovietCompleteReview ? `RA2 HD Soviet Buildings ${sovietRevision}` : sovietBatchR2 ? 'RA2 HD M1.6b R2' : sovietBatchReview ? 'RA2 HD M1.6b' : napowrReview ? 'RA2 HD M1.6a' : unified ? 'RA2 HD M1.5' : 'RA2 HD';
app.setName(profileName);
app.setPath('userData', process.env.RA2_DESKTOP_USER_DATA ? path.resolve(process.env.RA2_DESKTOP_USER_DATA) : environmentReview ? path.resolve(appRoot, '../../../../M2.1-Review-Profile') : yuriUnitReview ? path.resolve(appRoot, '../../../../Yuri-Review-Profile') : trainerReview ? path.resolve(appRoot, '../../../../Trainer-Review-Profile') : path.join(app.getPath('appData'), profileName));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: 'ra2', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let displayControl;
let window, profile, profileError = '', gameSession, initialized = false;
const records = [];
const record = event => records.push({ time: Date.now(), ...event });
const registration = path.join(app.getPath('userData'), 'resource-registration.json');
async function register(directory, persist) {
    const started = performance.now();
    profile = await validateProfile(directory);
    const profileMs = performance.now() - started;
    if (unified) {
        const hd = await registerHdResourcesWhenReady(profile.root, record, {
            deferPageHashes: true,
            requireComplete: app.isPackaged && (editionReview || buildingCoverageReview)
                && profile.root === bundledDirectory(appRoot, 'RA2-HD-Editions-Resources'),
        });
        for (const [route, file] of hd.routes) profile.routes.set(route, file);
        for (const [route, value] of hd.selections) profile.selections.set(route, value);
        profile.uiRoot = hd.uiRoot;
    }
    record({ type: 'startup-registration', profileMs, totalMs: performance.now() - started });
    if (persist) {
        await fs.mkdir(app.getPath('userData'), { recursive: true });
        await fs.writeFile(`${registration}.tmp`, JSON.stringify({ schemaVersion: 1, directory: profile.root }, null, 2));
        await fs.rename(`${registration}.tmp`, registration);
    }
    profileError = '';
    record({ type: 'profile-validated', core: profile.manifest.files.map(f => f.virtualName) });
}
async function discover() {
    try {
        let saved;
        try { saved = JSON.parse(await fs.readFile(registration, 'utf8')); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (!saved && (uiReview || editionReview || buildingCoverageReview) && app.isPackaged && process.env.RA2_DESKTOP_NO_DISCOVERY !== '1') {
            const directory = bundledDirectory(appRoot, (editionReview || buildingCoverageReview) ? 'RA2-HD-Editions-Resources' : 'RA2-HD-UI-Resources');
            try {
                if ((await fs.stat(directory)).isDirectory()) saved = { schemaVersion: 1, directory };
            } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (!saved && unified && !uiReview && !editionReview && !buildingCoverageReview && process.env.RA2_DESKTOP_NO_DISCOVERY !== '1') {
            // Read the previous registration only. Never migrate its settings or rewrite it.
            try { saved = JSON.parse(await fs.readFile(path.join(app.getPath('appData'), 'RA2 HD/resource-registration.json'), 'utf8')); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (saved) {
            if (saved.schemaVersion !== 1 || typeof saved.directory !== 'string') throw new Error('Invalid saved resource registration');
            await register(saved.directory, unified);
        } else if (!unified && !app.isPackaged && process.env.RA2_DESKTOP_NO_DISCOVERY !== '1') {
            await register(path.join(appRoot, '.local'), true);
        } else { throw new Error('No imported profile registered yet.'); }
    } catch (e) { profile = undefined; profileError = e.message; record({ type: 'profile-unavailable', message: profileError }); }
}
function openWindow() {
    window = new BrowserWindow({ title: buildingCoverageReview ? 'Red Alert 2 HD — Soviet Buildings M1.6C' : editionReview ? 'Red Alert 2 HD — RA2 / Yuri’s Revenge' : uiReview ? 'Red Alert 2 HD — UI M1.8' : sovietCompleteReview ? 'Red Alert 2 HD — Soviet Buildings Review' : sovietBatchReview ? 'Red Alert 2 HD — M1.6b Review' : napowrReview ? 'Red Alert 2 HD — M1.6a Review' : unified ? 'Red Alert 2 HD — M1.5' : 'Red Alert 2 HD', width: 1280, height: 960, backgroundColor: '#171b20',
        webPreferences: { session: gameSession, preload: path.join(appRoot, 'desktop/preload.cjs'),
            contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!isGameURL(url)) { event.preventDefault(); record({ type: 'navigation-denied', url }); } });
    window.webContents.on('will-redirect', (event, url) => { if (!isGameURL(url)) event.preventDefault(); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('render-process-gone', (_, details) => record({ type: 'renderer-gone', ...details }));
    window.webContents.on('console-message', details => {
        const prefix = '[World HD match] ';
        if (!details.message?.startsWith(prefix) || details.message.length > 65536) return;
        try {
            const state = JSON.parse(details.message.slice(prefix.length));
            if (state.schema !== 'world-hd-match-v1') return;
            const diagnostic = { time: Date.now(), app: app.getAppPath(), executable: process.execPath,
                sourceHead: packageMetadata.sourceHead, resources: profile?.root, ...state };
            record({ type: 'world-hd-match', ...diagnostic });
            fs.writeFile(path.join(app.getPath('userData'), 'world-hd-latest.json'),
                JSON.stringify(diagnostic, null, 2) + '\n').catch(error => record({
                    type: 'world-hd-diagnostic-write-failed', message: error.message }));
        } catch { /* Other renderer console messages remain outside this diagnostic. */ }
    });
    window.on('closed', () => { window = undefined; });
    window.loadURL('ra2://game/');
    displayControl?.restore();
}
app.whenReady().then(async () => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    gameSession = session.fromPartition('persist:ra2-offline');
    gameSession.webRequest.onBeforeRequest((details, callback) => {
        const allowed = isLocalRequest(details.url, 'ra2://game/');
        record({ type: allowed ? 'request' : 'request-denied', url: details.url });
        callback({ cancel: !allowed });
    });
    const permissionAllowed = (contents, permission, origin) => contents === window?.webContents && isGameURL(contents?.getURL()) && isGameURL(origin) && ['pointerLock', 'fullscreen'].includes(permission);
    gameSession.setPermissionCheckHandler((contents, permission, origin) => permissionAllowed(contents, permission, origin));
    gameSession.setPermissionRequestHandler((contents, permission, callback, details) => {
        const allowed = permissionAllowed(contents, permission, details.requestingUrl ?? contents.getURL());
        record({ type: 'permission', permission, allowed }); callback(allowed);
    });
    const appFiles = new Set(JSON.parse(await fs.readFile(path.join(appRoot, 'desktop/app-files.json'), 'utf8')));
    gameSession.protocol.handle('ra2', createHandler({ appRoot, appFiles, getProfile: () => profile, getError: () => profileError, record }));
    ipcMain.handle('desktop:choose-profile', async event => {
        if (event.sender !== window?.webContents || event.senderFrame !== event.sender.mainFrame ||
            !isGameURL(event.senderFrame.url) || !['/', '/__desktop/profile'].includes(new URL(event.senderFrame.url).pathname) || profile) return 'Resource selection is unavailable here.';
        const result = await dialog.showOpenDialog(window, { title: 'Choose existing imported RA2 profile', properties: ['openDirectory'] });
        if (result.canceled) return 'Selection cancelled; existing data is unchanged.';
        try { await register(result.filePaths[0], true); await window.loadURL('ra2://game/'); return 'Registered'; }
        catch (e) { profile = undefined; profileError = e.message; return `Unable to use this profile: ${profileError}`; }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        { label: 'RA2 HD', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
        { role: 'windowMenu' },
    ]));
    displayControl = installDisplay({ app, screen, ipcMain, getWindow: () => window, isGameURL });
    installControls({ app, screen, ipcMain, getWindow: () => window, isGameURL,
        cursorHelper: path.join(appRoot, 'desktop/restore-cursor') });
    await discover();
    initialized = true;
    openWindow();
}).catch(error => { console.error(error); app.quit(); });
app.on('activate', () => { if (initialized && !BrowserWindow.getAllWindows().length) openWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => {
    // Local diagnostic records contain no retail bytes; no server needs shutting down.
    const trace = { electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform, arch: process.arch, records };
    // Synchronous write is required because shutdown does not wait for promises.
    writeTrace(trace);
});
function writeTrace(trace) { writeFileSync(path.join(app.getPath('userData'), 'last-session.json'), JSON.stringify(trace, null, 2)); }
