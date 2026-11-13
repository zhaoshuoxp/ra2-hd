import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { MoveOrder } from '../../src/game/order/MoveOrder';
import { IniFile } from '../../src/data/IniFile';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes } from '../test-support/resources';
import { campaignMovieSubtitles } from '../../src/gui/campaign/CampaignSubtitleTracks';
import { Bridges } from '../../src/game/map/Bridges';

const original = new CampaignDefinition('ra2', 'all03u.map', new TextDecoder().decode(
    parseMix(requiredBytes('assets/ra2/maps01.mix'), 'maps01.mix').openFile('all03u.map').getBytes()));

test('original completed IFV guards hand off to higher-priority demonstrations at their source waypoints; legacy stays pinned', () => {
    const run = (enabled: boolean, held = true) => {
        const owner: any = { getOwnedObjects: () => units };
        const unit = (id: number, name: string, rx: number, ry: number): any => ({ id, name, owner, tile: { rx, ry }, rules: {},
            isSpawned: true, isUnit: () => true, isInfantry: () => name === 'ENGINEER',
            unitOrderTrait: { clearOrders() {}, cancelAllTasks() {} },
            ...(name === 'FV' ? { transportTrait: { units: [], getAvailableCapacity: () => 1 } } : {}) });
        const units = [unit(1, 'FV', 85, 128), unit(2, 'FV', 85, 125), unit(3, 'FV', 85, 122), unit(4, 'ENGINEER', 85, 126)];
        const game: any = { gameOpts: { campaign: enabled ? { teamRecruitmentVersion: 1 } : {} },
            map: { getTileAtWaypoint: (n: number) => { const p = original.waypoints.get(n)!; return { rx: p.x, ry: p.y }; } },
            rules: { getIni: () => new IniFile('') } };
        const manager: any = new CampaignTeams(original, game, () => owner, undefined, 17);
        for (const type of ['0AF2DAFC', '0AF2930C', '0AF2AEFC']) {
            const team = manager.create(type); team.phase = held ? 'holding' : 'active'; team.line = held ? 1 : 0;
        }
        const demo = manager.create('0C15D3DC');
        return { phase: demo.phase, ids: demo.members.map((u: any) => u.id).sort() };
    };
    expect(run(false)).toEqual({ phase: 'assembling', ids: [4] });
    expect(run(true, false)).toEqual({ phase: 'assembling', ids: [4] });
    expect(run(true)).toEqual({ phase: 'active', ids: [2, 4] });
});

test('armed hostile and mind-controlled civilians can be acquired while neutral and legacy campaign civilians remain excluded', () => {
    const acquire = (unit: any, campaign?: any, modernSolo = false) => (AttackTrait.prototype as any).canPassiveAcquire(unit,
        { gameOpts: { campaign, ...(modernSolo ? { civilianTargetingVersion: 1 } : {}) },
            rules: { general: { paradrop: { paradropPlane: 'PDPLANE' } } } });
    const unit: any = { name: 'CIVAN', owner: { isNeutral: false }, rules: { civilian: true, threatPosed: 0 },
        primaryWeapon: {}, isBuilding: () => false };
    expect(acquire(unit, {})).toBe(false); expect(acquire(unit, { civilianTargetingVersion: 1 })).toBe(true);
    expect(acquire(unit)).toBe(false); expect(acquire(unit, undefined, true)).toBe(true);
    unit.owner.isNeutral = true; expect(acquire(unit, undefined, true)).toBe(false);
    unit.owner.isNeutral = false; unit.primaryWeapon = undefined; expect(acquire(unit, undefined, true)).toBe(false);
    unit.mindControllableTrait = { getController: () => ({}) }; expect(acquire(unit, undefined, true)).toBe(true);
});

test('explicit bridge targets remain valid rally destinations only under the selected campaign policy', () => {
    const sourceObject: any = { isBuilding: () => true, rules: {}, rallyTrait: { getRallyPoint: () => ({}) } };
    const target = { obj: { isOverlay: () => true, isBridge: () => true, isTechno: () => false,
        isInfantry: () => false, isVehicle: () => false, rules: {} } };
    const valid = (campaign?: any, modernSolo = false) => (MoveOrder.prototype as any).isValid.call({ sourceObject, target,
        game: { gameOpts: { campaign, ...(modernSolo ? { bridgeRallyVersion: 1 } : {}) } }, unitSelection: {} });
    expect(valid()).toBe(false); expect(valid(undefined, true)).toBe(true);
    expect(valid({ bridgeRallyVersion: 1 })).toBe(true); expect(valid({})).toBe(false);
});

test('the edition introduction exposes every original supplied subtitle cue', () => {
    const cues = campaignMovieSubtitles('a00_f00e', { get: (key: string) => key });
    expect(cues).toHaveLength(51); expect(cues[0].start).toBeCloseTo(2 + 10 / 60);
    expect(cues.at(-1)!.start).toBe(151);
    expect(cues.every(cue => cue.start < cue.end)).toBe(true);
    const expansion = campaignMovieSubtitles('yr_a00_f00e', { get: (key: string) => key });
    expect(expansion).toHaveLength(59); expect(expansion[0].start).toBe(4.5);
    expect(expansion[0].text).not.toBe(cues[0].text);
});

test('high bridge pictures use the centre lane at TMP-supported contacts and retain actual gaps and damaged decks', () => {
    for (const xAxis of [true, false]) {
        const obj: any = { tile: { rx: 20, ry: 30, z: 0 }, tileElevation: 4,
            isXBridge: () => xAxis, healthTrait: { health: 100 } };
        const centre = { rx: 20 + Number(!xAxis), ry: 30 + Number(xAxis) };
        const dx = Number(xAxis), dy = Number(!xAxis), tiles = new Map<string, any>();
        for (const n of [-1, 1]) tiles.set(`${centre.rx + n * dx},${centre.ry + n * dy}`, { z: 4 });
        const context = { tiles: { getByMapCoords: (x: number, y: number) => tiles.get(`${x},${y}`) } };
        const draw = (value: number) => (Bridges.prototype as any).computeHighBridgeDisplayValue.call(context, { obj }, value);
        const offset = xAxis ? 0 : 9;
        expect(draw(offset + 7)).toBe(offset); expect(draw(offset + 8)).toBe(offset);
        tiles.delete(`${centre.rx + dx},${centre.ry + dy}`); expect(draw(offset + 7)).toBe(offset + 7);
        obj.healthTrait.health = 25; expect(draw(offset + 8)).toBe(offset + 8);
        expect(draw(offset + 6)).toBe(offset + 6);
    }
});
