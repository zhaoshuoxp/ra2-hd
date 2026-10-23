import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateTrainerLifecycle(page, report, out) {
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
    const r = report.trainerLifecycle = { category: 'NATIVE_RESTART_MENU_AND_EDITION_RELOAD', checks: [] };
    const prepare = async () => page.evaluate(() => {
        const d = window.__ra2debug, t = d.trainer;
        t.setEnabled(true); t.setNumber('credits', 12345);
        t.send({ type: 'effect', effect: 'power', enabled: true, value: 500 }); d.game.update();
        d.gameScreen.menu.open();
        t.send({ type: 'credits', mode: 'add', value: 12345 });
        window.previousTrainer = { session: t.session, player: d.localPlayer, power: d.localPlayer.powerTrait.debugGetState().power };
        return t.session.id;
    });
    r.contexts = await page.evaluate(() => {
        const d = window.__ra2debug, t = d.trainer, screen = d.gameScreen;
        t.setEnabled(true);
        const denied = () => !t.send({ type: 'reveal' });
        screen.isSinglePlayer = false; const network = denied(); screen.isSinglePlayer = true;
        screen.isLanGame = true; const lan = denied(); screen.isLanGame = false;
        d.localPlayer.isObserver = true; const spectator = denied(); d.localPlayer.isObserver = false;
        t.endSession(); const playbackNoSession = denied();
        return { network, lan, spectator, playbackNoSession };
    });
    assert(Object.values(r.contexts).every(Boolean));
    // Recreate the screen through its existing restart diagnostic after the no-session gate check.
    await page.evaluate(async () => { await window.r.reset; });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && !!window.__ra2debug.trainer.session, undefined, { timeout: 90000 });
    const oldId = await prepare();
    await page.evaluate(async () => { await window.r.reset; });
    await page.waitForFunction(id => window.__ra2debug?.game?.status === 1 && window.__ra2debug.trainer.session?.id !== id, oldId, { timeout: 90000 });
    const restarted = await page.evaluate(() => {
        const t = window.__ra2debug.trainer, old = window.previousTrainer;
        return { enabled: t.preferences.enabled, empty: !t.session.pending && !t.session.enabledEffects.size && !t.session.protectedObjects.size,
            cancelled: old.session.pending === 0, staleRejected: !old.session.dispatch({ session: old.session.id, edition: old.session.edition, actor: old.player, command: { type: 'reveal' } }),
            powerRemoved: old.player.powerTrait.debugGetState().power === old.power - 500 };
    });
    assert(Object.values(restarted).every(Boolean)); r.restart = restarted;
    await prepare();
    await page.evaluate(() => window.__ra2debug.gameScreen.controller.goToScreen(0));
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 30000 });
    r.menu = await page.evaluate(() => {
        const t = window.__ra2debug.trainer, old = window.previousTrainer;
        return { noSession: !t.session, pendingCancelled: old.session.pending === 0, enabled: t.preferences.enabled,
            controlsDisabled: [...document.querySelectorAll('[data-trainer-action]')].every(b => b.disabled) };
    });
    assert(Object.values(r.menu).every(Boolean));
    await page.getByRole('button', { name: locale['hd:menuoptions'], exact: true }).click();
    await page.getByRole('checkbox', { name: locale['trainer:enable'], exact: true }).waitFor();
    assert(await page.getByRole('checkbox', { name: locale['trainer:enable'], exact: true }).isChecked());
    await page.getByRole('checkbox', { name: locale['trainer:enable'], exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'trainer-main-options.png') });
    // Return using the existing root route, then exercise the actual edition switch UI.
    await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('edition'); location.replace(url.href); });
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    r.yr = await page.evaluate(() => {
        const t = window.__ra2debug.trainer, initial = { enabled: t.preferences.enabled, credits: t.preferences.credits, noSession: !t.session };
        t.setNumber('credits', 22222); return initial;
    });
    assert.deepEqual(r.yr, { enabled: false, credits: 10000, noSession: true });
    await page.getByRole('button', { name: locale['hd:menuedition'], exact: true }).click();
    await page.locator('[data-edition=ra2]').click({ timeout: 60000 });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    r.ra2 = await page.evaluate(() => {
        const t = window.__ra2debug.trainer;
        return { enabled: t.preferences.enabled, credits: t.preferences.credits, noSession: !t.session,
            yrCredits: JSON.parse(localStorage.getItem('_edition:yr:_r_trainer_v1')).credits };
    });
    assert.deepEqual(r.ra2, { enabled: true, credits: 12345, noSession: true, yrCredits: 22222 });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
    await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    r.newMatch = await page.evaluate(() => {
        const d = window.__ra2debug, s = d.trainer.session;
        return { master: d.trainer.preferences.enabled, empty: !s.pending && !s.enabledEffects.size && !s.protectedObjects.size,
            credits: d.localPlayer.credits, countryCount: d.game.rules.getMultiplayerCountries().length,
            sovietHd: d.gameScreen.generalOptions.graphics.hdAvailability.napowr };
    });
    assert(r.newMatch.master && r.newMatch.empty); assert.equal(r.newMatch.credits, 10000); assert.equal(r.newMatch.countryCount, 9);
    assert(r.newMatch.sovietHd.startsWith('HD active'));
    r.checks.push('Restart and exit cancel pending commands, remove power and reject old sessions', 'Menu Options shares master; match commands disabled', 'RA2 -> YR -> RA2 restores edition preferences and accepted resources', 'New match retains configuration only');
    await page.screenshot({ path: path.join(out, 'trainer-returned-ra2.png') });
}
