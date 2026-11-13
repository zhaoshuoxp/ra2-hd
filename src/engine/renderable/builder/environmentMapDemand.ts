import { ObjectType } from '@/engine/type/ObjectType';

export function prewarmCampaignUnits(game: any, demand: {
    prewarm?: (identity: string) => () => void;
    prefetch?: (identity: string) => () => void;
}, retain: (release: () => void) => void): void {
    const actual = new Set<string>(game.getWorld().getAllObjects()
        .filter((object: any) => object.isUnit()).map((object: any) => object.name));
    const speculative = (game.campaign?.launch?.semanticsVersion ?? 1) >= 22;
    const sourcePreview = (game.campaign?.launch?.semanticsVersion ?? 1) >= 25;
    for (const name of actual) {
        // New campaigns may contain whole enemy armies behind shroud. Their
        // startup cache yields to real renderers just like future arrivals.
        const release = (sourcePreview ? demand.prefetch ?? demand.prewarm : demand.prewarm)?.(name);
        if (release) retain(release);
    }
    for (const name of campaignUnitHdDemand(game)) {
        if (actual.has(name)) continue;
        // Predicted arrivals keep a best-effort cache, without permanently
        // pinning units absent from the current world ahead of live buildings.
        const release = (speculative ? demand.prefetch ?? demand.prewarm : demand.prewarm)?.(name);
        if (release) retain(release);
    }
}

export function campaignUnitHdDemand(game: any): Set<string> {
    const identities = new Set<string>(), definition = game.campaign?.definition;
    let teams = [...(definition?.teams.values() ?? [])];
    let forces = [...(definition?.taskForces.values() ?? [])];
    if ((game.campaign?.launch?.semanticsVersion ?? 1) >= 12 && definition?.ini) {
        // Expanded AI libraries retain unused templates for source fidelity.
        // Their presence must not reserve GPU space as future mission arrivals.
        const referenced = new Set<string>([...(definition.ini.getSection('TeamTypes')?.entries.values() ?? [])].map(String));
        for (const trigger of definition.triggers.values()) for (const action of trigger.actions) {
            if ([4, 5, 7, 80, 107].includes(action.opcode)) referenced.add(action.params[1]);
        }
        for (const trigger of definition.aiTriggers.values()) {
            referenced.add(trigger.team);
            if (trigger.secondTeam) referenced.add(trigger.secondTeam);
        }
        const dormant = new Set((definition.dormantRecords ?? []).filter((record: any) => record.section === 'TeamTypes')
            .map((record: any) => record.key));
        teams = teams.filter(team => referenced.has(team.id) && !dormant.has(team.id));
        const requiredForces = new Set(teams.map(team => team.taskForce));
        forces = forces.filter(force => requiredForces.has(force.id));
    }
    for (const force of forces) {
        for (const unit of force.units) identities.add(unit.type);
    }
    for (const team of teams) {
        if (!/^(yes|true|1)$/i.test(team.properties.Droppod ?? '')) continue;
        const plane = game.rules.general.paradrop.paradropPlane;
        if (plane) identities.add(plane);
    }
    return identities;
}

// Placed resources plus native states that ordinary play can create on this map.
export function environmentMapDemand(game: any, theater: any): Set<string> {
    const identities = new Set<string>(game.getWorld().getAllObjects().map((object: any) => object.name));
    for (const name of campaignUnitHdDemand(game)) identities.add(name);
    for (const node of game.campaign?.baseBuilder?.nodes ?? []) identities.add(node.type);
    if (game.campaign?.yr) for (const name of [...identities]) {
        if (!game.rules.hasObject(name, ObjectType.Building)) continue;
        for (const animation of game.rules.getBuilding(name).destroyAnim ?? []) identities.add(animation);
    }
    if (game.campaign?.yr) for (const trigger of game.campaign.definition.triggers.values()) {
        for (const action of trigger.actions) if (action.opcode === 125) identities.add(action.params[1]);
    }
    for (const tile of game.map.tiles.getAll()) {
        const animation = theater.tileSets.getTile(tile.tileNum)?.getAnimation();
        if (animation?.subTile === tile.subTile) identities.add(animation.name);
    }
    const smudges = game.rules.getIni().getSection('SmudgeTypes');
    for (const value of smudges?.entries.values() ?? []) {
        const name = String(Array.isArray(value) ? value[0] : value);
        if (!game.rules.hasObject(name, ObjectType.Smudge)) continue;
        const rule = game.rules.getObject(name, ObjectType.Smudge);
        if (rule.crater || rule.burn) identities.add(name);
    }
    if (game.gameOpts?.cratesAppear || game.campaign) {
        // Scenario rewards and building drops do not use the multiplayer
        // random-crate switch. They can appear after the initial map scan.
        for (const name of [game.rules.crateRules?.crateImg, game.rules.crateRules?.waterCrateImg]) {
            if (name && game.rules.hasObject(name, ObjectType.Overlay)) identities.add(name);
        }
    }
    return identities;
}
