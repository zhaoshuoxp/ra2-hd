// Harness-only: attach the existing built-in AI to the local player's normal
// resources and orders, so a match exercises two active economies and armies.
export async function enableAutoplay(page, report) {
    report.autoplay = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, manager = g.botManager, player = d.localPlayer;
        const other = [...manager.bots.values()][0];
        player.isAi = true;
        player.aiDifficulty = 4;
        const bot = manager.botFactory.create(player);
        bot.setGameApi(manager.gameApi);
        bot.setActionsApi(new other.actionsApi.constructor(g, manager.actionFactory, manager.actionQueue, bot));
        bot.setProductionApi(new other.productionApi.constructor(player.production));
        bot.setLogger(other.logger);
        manager.bots.set(player, bot);
        bot.onGameStart(manager.gameApi);
        return { player: player.name, country: player.country.name, mode: 'Existing built-in AI attached after normal MCV deployment; no resources, units, technology or attacks supplied' };
    });
}
