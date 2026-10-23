import React from 'react';
import { createRoot } from 'react-dom/client';
import { installOfflineGuard } from './networkGuard';
installOfflineGuard();
if (new URLSearchParams(location.search).get('stats') === '1') {
    const { installFrameStats } = await import('./frameStats');
    installFrameStats();
}
function showFailure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    (window as any).__m01Failure = message;
    let panel = document.getElementById('offline-failure');
    if (!panel) {
        panel = document.createElement('section');
        panel.id = 'offline-failure';
        panel.style.cssText = 'position:fixed;inset:40px;z-index:99999;background:#171b20;color:#fff;padding:32px;font:20px/1.6 system-ui;overflow:auto';
        document.body.append(panel);
    }
    panel.replaceChildren();
    const title = document.createElement('h1');
    title.textContent = 'Offline startup blocked';
    const detail = document.createElement('pre');
    detail.style.whiteSpace = 'pre-wrap';
    detail.textContent = message;
    const help = document.createElement('p');
    help.textContent = 'See docs/m0-1-report.md for the verified compatibility blocker. Local imports remain available after restart.';
    panel.append(title, detail, help);
}
addEventListener('error', event => showFailure(event.error ?? event.message));
addEventListener('unhandledrejection', event => showFailure(event.reason));
await import('../setupThreeGlobal');
const { registerBuiltInBot } = await import('../game/ai/thirdpartbot/builtIn/BuiltInBotAdapter');
registerBuiltInBot();
const { default: App } = await import('../App');
createRoot(document.getElementById('root')!).render(<App />);
