import type { CampaignDefinition } from '../../data/campaign/CampaignDefinition';
import { placeProducedBuilding } from '../action/PlaceBuildingAction';
import { QueueStatus } from '../player/production/ProductionQueue';
import { RadialTileFinder } from '../map/tileFinder/RadialTileFinder';
import { ObjectType } from '../../engine/type/ObjectType';
import { clearCampaignFoundation } from './CampaignFoundationClearance';

export interface CampaignBaseNode { house: string; index: number; type: string; x: number; y: number }

export function campaignBaseNodes(definition: CampaignDefinition): CampaignBaseNode[] {
    const nodes: CampaignBaseNode[] = [];
    for (const house of definition.houses.values()) {
        const section = definition.ini.getSection(house.id)!, count = section.getNumber('NodeCount');
        if (!Number.isSafeInteger(count) || count < 0 || count > 4096) throw new Error(`Invalid base node count: ${house.id}`);
        for (let index = 0; index < count; index++) {
            const key = String(index).padStart(3, '0'), raw = section.getString(key), [type, x, y, ...extra] = raw.split(',');
            if (!type || !/^\d+$/.test(x) || !/^\d+$/.test(y) || extra.length) throw new Error(`[${house.id}] ${key} invalid base node: ${raw}`);
            nodes.push({ house: house.id, index, type, x: Number(x), y: Number(y) });
        }
    }
    return nodes;
}

// Source base nodes request ordinary construction-yard production. They do not
// create buildings on a timer or grant technology to the human player.
export class CampaignBaseBuilder {
    readonly nodes: CampaignBaseNode[];
    readonly trace: { tick: number; house: string; node: number; type: string; phase: 'queued' | 'placed' }[] = [];
    private next = new Map<any, number>();
    private decisionNext = new Map<any, number>();
    private automaticSites = new Map<string, any>();
    private automaticTypes = new Map<string, string>();
    constructor(private readonly definition: CampaignDefinition, private readonly game: any,
        private readonly house: (reference: string | number) => any, private readonly production: ReadonlySet<any>,
        private readonly semanticsVersion = 4) {
        this.nodes = campaignBaseNodes(definition);
    }

    update(tick: number): void {
        if (this.semanticsVersion >= 5) { this.updateSourcePlans(tick); return; }
        for (const owner of this.production) {
            if (owner.defeated || tick < (this.next.get(owner) ?? 0)) continue;
            const nodes = this.nodes.filter(node => this.house(node.house) === owner);
            const node = nodes.find(node => !this.game.map.getGroundObjectsOnTile(this.tile(node)).some((object: any) =>
                object.isBuilding() && !object.isDestroyed && object.name === node.type && object.tile.rx === node.x && object.tile.ry === node.y));
            if (!node) continue;
            const rules = this.game.rules.getBuilding(node.type), production = owner.production;
            if (!production.isAvailableForProduction(rules)) continue;
            const queue = production.getQueueForObject(rules);
            if (queue.status === QueueStatus.Idle) {
                // Version 4 journals retain their former percentage gate. RA2's
                // base planner starts through Production Begins; PercentBuilt
                // is retained source metadata, not a random construction gate.
                if (this.semanticsVersion < 5) {
                    const activity = this.definition.ini.getSection(node.house)!.getNumber('PercentBuilt');
                    if (!Number.isInteger(activity) || activity < 0 || activity > 100) throw new Error(`Invalid source build activity: ${node.house}`);
                    if (!activity || tick < (this.decisionNext.get(owner) ?? 0)) continue;
                    if (activity < 100) {
                        this.decisionNext.set(owner, tick + 15);
                        if (this.game.generateRandomInt(1, 100) > activity) continue;
                    }
                }
                queue.push(rules, 1, this.game.sellTrait.computePurchaseValue(rules, owner));
                this.trace.push({ tick, house: owner.name, node: node.index, type: node.type, phase: 'queued' });
            } else if (queue.status === QueueStatus.Ready && queue.getFirst()?.rules === rules) {
                if (placeProducedBuilding(this.game, owner, rules, this.tile(node), true)) {
                    this.next.set(owner, tick + Math.max(0, Math.round(owner.handicap.buildDelay * 60 * 15)));
                    this.trace.push({ tick, house: owner.name, node: node.index, type: node.type, phase: 'placed' });
                }
            }
        }
    }

    private updateSourcePlans(tick: number): void {
        for (const owner of this.production) {
            if (owner.defeated || tick < (this.next.get(owner) ?? 0)) continue;
            const worker = this.game.getConstructionWorker(owner), production = owner.production;
            for (const node of this.nodes.filter(node => this.house(node.house) === owner)) {
                const originalTypeMissing = this.semanticsVersion >= 12 && !this.game.rules.hasObject(node.type, ObjectType.Building);
                const type = originalTypeMissing ? this.automaticTypes.get(this.siteKey(node))
                    ?? this.automaticDefenseType(owner) : node.type;
                if (!type) continue;
                const automatic = this.semanticsVersion >= 12 && node.x === 0 && node.y === 0;
                let tile = automatic ? this.automaticSites.get(this.siteKey(node)) : this.tile(node);
                if (tile && this.game.map.getGroundObjectsOnTile(tile).some((object: any) => object.isBuilding() && !object.isDestroyed
                    && object.name === type && object.tile.rx === tile.rx && object.tile.ry === tile.ry)) continue;
                const rules = this.game.rules.getBuilding(type);
                if (!production.isAvailableForProduction(rules, this.semanticsVersion >= 18 && !automatic && !originalTypeMissing)) continue;
                const queue = production.getQueueForObject(rules);
                if (queue.status === QueueStatus.Idle) {
                    queue.push(rules, 1, this.game.sellTrait.computePurchaseValue(rules, owner));
                    if (originalTypeMissing) this.automaticTypes.set(this.siteKey(node), type);
                    this.trace.push({ tick, house: owner.name, node: node.index, type, phase: 'queued' });
                    break;
                }
                // Start paid construction while the source site is being
                // cleared. Placement checks belong to the completed building;
                // Soviet 03's lab sale and timed ownership handoff depend on it.
                if (automatic && queue.status === QueueStatus.Ready && queue.getFirst()?.rules === rules
                    && (!tile || !worker.canPlaceAt(type, tile, { normalizedTile: true, ignoreShroud: true }))) {
                    tile = this.automaticSite(type, owner, worker);
                    if (tile) this.automaticSites.set(this.siteKey(node), tile);
                }
                if (tile && queue.status === QueueStatus.Ready && queue.getFirst()?.rules === rules
                    && (this.game.gameOpts?.campaign?.baseActivationVersion ?? 0) >= 3
                    && !worker.canPlaceAt(type, tile, { normalizedTile: true, ignoreAdjacent: true, ignoreShroud: true })) {
                    const art = this.game.art.getObject(type, ObjectType.Building), cells: any[] = [];
                    for (let x = 0; x < art.foundation.width; x++) for (let y = 0; y < art.foundation.height; y++) {
                        const cell = this.game.map.tiles.getByMapCoords(tile.rx + x, tile.ry + y);
                        if (cell) cells.push(cell);
                    }
                    clearCampaignFoundation(this.game, owner, cells);
                }
                if (tile && queue.status === QueueStatus.Ready && queue.getFirst()?.rules === rules
                    && worker.canPlaceAt(type, tile, { normalizedTile: true, ignoreAdjacent: true, ignoreShroud: true })
                    && placeProducedBuilding(this.game, owner, rules, tile, true,
                        this.semanticsVersion >= 18 && !automatic && !originalTypeMissing)) {
                    this.next.set(owner, tick + Math.max(0, Math.round(owner.handicap.buildDelay * 60 * 15)));
                    this.trace.push({ tick, house: owner.name, node: node.index, type, phase: 'placed' });
                    break;
                }
            }
        }
    }

    private tile(node: CampaignBaseNode): any {
        const tile = this.game.map.tiles.getByMapCoords(node.x, node.y);
        if (!tile) throw new Error(`Missing base node tile: ${node.house}:${node.index}`);
        return tile;
    }
    private siteKey(node: CampaignBaseNode): string { return node.house + ':' + node.index; }
    private automaticDefenseType(owner: any): string | undefined {
        // Original name lookup returns the same -1 used by an automatic base
        // defense node. Retain the raw label, rather than aliasing it to radar.
        const ai = this.game.rules.getIni().getSection('AI');
        const names = [...new Set(['BuildDefense', 'BuildPDefense', 'BuildAA', 'BuildDummy']
            .flatMap(key => ai?.getArray(key) ?? []))];
        const candidates = names.filter(name => this.game.rules.hasObject(name, ObjectType.Building))
            .map(name => this.game.rules.getBuilding(name)).filter(rules => owner.production.isAvailableForProduction(rules));
        const count = (name: string) => [...owner.buildings].filter((building: any) => !building.isDestroyed && building.name === name).length;
        // Preserve source list order on ties; exact original quadrant threat
        // ranking remains qualified separately from production and placement.
        return candidates.sort((a, b) => count(a.name) - count(b.name))[0]?.name;
    }
    private automaticSite(type: string, owner: any, worker: any): any {
        const center = this.game.campaign?.yr?.baseCenters.get(owner);
        const anchors = center ? [{ tile: center }] : [...owner.buildings].filter((building: any) => !building.isDestroyed && building.isSpawned)
            .sort((a: any, b: any) => Number(!!b.rules.constructionYard) - Number(!!a.rules.constructionYard) || a.id - b.id);
        const size = this.game.map.mapBounds.getFullSize();
        for (const anchor of anchors) {
            const tile = new RadialTileFinder(this.game.map.tiles, this.game.map.mapBounds, anchor.tile,
                { width: 1, height: 1 }, 0, size.width + size.height,
                candidate => worker.canPlaceAt(type, candidate, { normalizedTile: true, ignoreShroud: true }), false).getNextTile();
            if (tile) return tile;
        }
    }
    snapshot(): unknown {
        return { next: [...this.next].map(([owner, tick]) => [owner.name, tick]),
            ...(this.semanticsVersion >= 12 ? { automaticSites: [...this.automaticSites].map(([id, tile]) => [id, tile.rx, tile.ry]),
                automaticTypes: [...this.automaticTypes] } : {}),
            ...(this.decisionNext.size ? { decisionNext: [...this.decisionNext].map(([owner, tick]) => [owner.name, tick]) } : {}) };
    }
}
