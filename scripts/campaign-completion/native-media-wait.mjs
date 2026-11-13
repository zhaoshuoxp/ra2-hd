// Keep the test observer's independent turn gate closed across asynchronous
// movie completion. Product fullscreen/radar pause policies remain active.
export async function waitForCampaignFullscreen(page) {
    const paused = await page.evaluate(() => {
        const manager = window.__ra2debug.gameScreen.gameTurnMgr, paused = manager.paused;
        if (manager.getErrorState?.()) throw Error('Native product error stopped simulation: ' + document.body.innerText.slice(-1200));
        manager.setPaused(true); return paused;
    });
    try {
        await page.waitForFunction(() => !window.__ra2debug.game?.campaign?.captureMedia?.().movies
            .some(movie => movie.placement === 'fullscreen' || movie.placement === 'transmission-paused'), undefined, { timeout: 180000 });
    } finally {
        await page.evaluate(paused => {
            const manager = window.__ra2debug.gameScreen?.gameTurnMgr;
            if (manager) { manager.setCampaignPaused(true); manager.setPaused(paused); }
        }, paused);
    }
}
