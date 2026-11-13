import { EnterTileEvent } from '../event/EnterTileEvent';

// Physical ground contact is an entry, including a source CellTag under an
// airborne reinforcement. Earlier journals retain their original event stream.
export function notifyCampaignParadropLanding(game: any, unit: any): void {
    if ((game.gameOpts?.campaign?.semanticsVersion ?? 0) >= 23 && unit.isSpawned && !unit.isDestroyed) {
        game.events.dispatch(new EnterTileEvent(unit.tile, unit));
    }
}
