import assert from 'node:assert/strict';
import path from 'node:path';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output, mode = 'locked'] = process.argv.slice(2);
const session = await startSession(receipt, output, 'yr');
let failure;
try {
    const { page, app, report } = session;
    await app.evaluate(({ app, BrowserWindow }) => {
        app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus();
    });
    await page.bringToFront();
    report.cursorMode = mode;
    await page.evaluate(mode => {
        const d = window.__ra2debug;
        d.trainer.setEnabled(true);
        window.__cursorErrors = [];
        if (mode === 'locked') {
            d.gameScreen.pointer.lock();
            document.addEventListener('mousedown', () => d.gameScreen.pointer.getPointerLock().request()
                .catch(error => window.__cursorErrors.push({ name: error.name, message: error.message })),
            { capture: true, once: true });
        } else d.gameScreen.pointer.unlock();
    }, mode);
    if (mode === 'locked') {
        await page.mouse.click(400, 300);
        await page.waitForFunction(() => window.__ra2debug.gameScreen.pointer.getPointerLock().isActive());
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        const saved = await page.evaluate(() => {
            const d = window.__ra2debug, pointer = d.gameScreen.pointer;
            const button = document.querySelector('.trainer-bar button');
            const rect = button.getBoundingClientRect(), canvas = pointer.canvas.getBoundingClientRect();
            const client = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            const position = { x: (client.x - canvas.left) * pointer.canvasMetrics.width / canvas.width,
                y: (client.y - canvas.top) * pointer.canvasMetrics.height / canvas.height };
            Object.assign(pointer.getPosition(), position);
            return { client, position, normalized: { x: client.x / innerWidth, y: client.y / innerHeight } };
        });
        if (mode === 'locked') {
            await page.mouse.down(); await page.mouse.up();
            await page.waitForFunction(() => document.querySelector('.trainer-popover')
                && !window.__ra2debug.gameScreen.pointer.restoringPosition
                && !window.__ra2debug.gameScreen.pointer.getPointerLock().isActive());
        } else {
            const result = await page.evaluate(position => window.desktopApp.restorePointer(position), saved.normalized);
            assert(result.restored, 'Native coordinate restoration must succeed');
        }
        const native = await app.evaluate(({ BrowserWindow, screen }) => ({ point: screen.getCursorScreenPoint(),
            bounds: BrowserWindow.getFocusedWindow().getContentBounds() }));
        const expected = { x: native.bounds.x + Math.round(saved.normalized.x * native.bounds.width),
            y: native.bounds.y + Math.round(saved.normalized.y * native.bounds.height) };
        const current = await page.evaluate(() => ({ ...window.__ra2debug.gameScreen.pointer.getPosition() }));
        assert(Math.abs(native.point.x - expected.x) <= 2 && Math.abs(native.point.y - expected.y) <= 2,
            'Native cursor must remain at the clicked trainer button');
        if (mode === 'locked') assert(Math.abs(current.x - saved.position.x) <= 2 && Math.abs(current.y - saved.position.y) <= 2,
            'Virtual cursor must survive the menu handoff');
        (report.handoffs ??= []).push({ attempt, saved, native, expected, current });
        if (mode === 'locked') {
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => window.__ra2debug.gameScreen.pointer.getPointerLock().isActive());
        }
    }
    await page.screenshot({ path: path.join(session.out, 'trainer-cursor.png') });
} catch (error) {
    failure = error;
    session.report.pointerState = await session.page.evaluate(() => {
        const d = window.__ra2debug, p = d.gameScreen.pointer;
        return { active: p.getPointerLock().isActive(), lockMode: p.getUserLockMode(),
            focused: document.hasFocus(), permission: p.userPermissionGranted,
            restoring: p.restoringPosition, held: d.trainer.inputHeld, position: p.getPosition(), errors: window.__cursorErrors };
    });
    session.report.nativeWindows = await session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({
        focused: window.isFocused(), visible: window.isVisible(), destroyed: window.isDestroyed(),
        bounds: window.getContentBounds(), url: window.webContents.getURL(), platform: process.platform,
    })));
}
finally { await session.close(failure); }
if (failure) throw failure;
console.log(JSON.stringify({ status: session.report.status, handoffs: session.report.handoffs.length }));
