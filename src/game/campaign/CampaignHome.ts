export function campaignHomeTile(game: any): any {
    const basic = game.campaign?.definition.ini.getSection('Basic');
    if (!basic) return;
    const waypoint = Number(basic.getString('HomeCell'));
    if (!Number.isSafeInteger(waypoint) || waypoint < 0) throw new Error('Invalid original campaign HomeCell');
    return game.map.getTileAtWaypoint(waypoint);
}
