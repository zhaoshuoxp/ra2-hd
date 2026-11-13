import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime } from '../../src/game/campaign/CampaignRuntime';
import { canControlOwner, controllableObjects } from '../../src/game/campaign/CampaignControl';
import { IniFile } from '../../src/data/IniFile';
import { SelectUnitsAction } from '../../src/game/action/SelectUnitsAction';
import { OrderUnitsAction } from '../../src/game/action/OrderUnitsAction';
import { OrderActionContext } from '../../src/game/action/OrderActionContext';
import { Order } from '../../src/game/order/Order';
import { Country } from '../../src/game/Country';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { OilDerrickTrait } from '../../src/game/gameobject/trait/OilDerrickTrait';
import { NotifySpawn } from '../../src/game/gameobject/trait/interface/NotifySpawn';
import { NotifyOwnerChange } from '../../src/game/gameobject/trait/interface/NotifyOwnerChange';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov05u.map').getBytes();
expect(sha256(bytes)).toBe('31c6883ce678c0bcede293c571a610d355319a7cd729d45560183ced152a5629');
function sourcePlayers(version: 5 | 6 | 7) {
    const definition = new CampaignDefinition('ra2', 'sov05u.map', new TextDecoder().decode(bytes));
    const rules = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString());
    const names = [...new Set([...rules.getSection('Countries')!.entries.values(), ...definition.ini.getSection('Countries')!.entries.values()])];
    rules.mergeWith(definition.ini);
    const game: any = { map: { tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry }) } },
        world: { getAllObjects: () => [] }, addPlayer() {}, rules: { colors: { get: () => ({}) }, getIni: () => rules,
        hasCountry: (name: string) => names.includes(name),
        getCountry: (name: string) => { if (!names.includes(name)) throw Error('Unknown country ' + name); return { name, id: String(names.indexOf(name)),
            parentCountry: rules.getSection(name)?.getString('ParentCountry') || undefined,
            multiplay: rules.getSection(name)?.getBool('Multiplay'), multiplayPassive: rules.getSection(name)?.getBool('MultiplayPassive'),
            side: rules.getSection(name)?.getString('Side') === 'Civilian' ? 2 : 0 }; } } };
    const launch: any = { edition: 'ra2', mission: 'sov05u.map', difficulty: 'normal', diagnostic: false,
        semanticsVersion: version, sourceSha256: sha256(bytes), provenanceDigest: 'source-fixture' };
    const runtime = new CampaignRuntime(definition, launch, game);
    runtime.createPlayers({ createCombatant: (name: string, country: any, _start: any, _color: any, isAi: boolean) => {
        const objects: any[] = [];
        return { name, country, isAi, objects, getOwnedObjects: () => objects,
            getOwnedObjectById: (id: number) => objects.find(unit => unit.id === id) };
    } });
    return { game, runtime, player: runtime.houses.get('Player House'), alias: runtime.houses.get('Other3 House'),
        ally: runtime.houses.get('Other2 House') };
}

test('the unchanged Soviet 05 source grants three PlayerControl houses while ordinary allies and legacy journals retain strict ownership', () => {
    const f = sourcePlayers(6);
    expect(f.player.campaignControlledPlayers.map((owner: any) => owner.name)).toEqual(['Player House', 'BadGuy3 House', 'Other3 House']);
    expect(canControlOwner(f.player, f.alias)).toBe(true); expect(canControlOwner(f.player, f.ally)).toBe(false);
    expect(canControlOwner(f.ally, f.alias)).toBe(false); expect(canControlOwner(undefined, f.alias)).toBe(false);
    expect(canControlOwner(f.player, { ...f.alias, campaignController: undefined })).toBe(false);
    expect(() => sourcePlayers(5)).toThrow('Unknown country Civie1 House');
    expect(f.runtime.sourceQuirks).toEqual([{ section: 'Civilian1', key: 'ParentCountry', value: 'Civie1 House', kind: 'unregistered-country-label' }]);
    expect(f.runtime.houses.get('Civie1 House').country.matchesCountry('Civie1 House')).toBe(true);
    expect(f.runtime.definition.source).toBe(new TextDecoder().decode(bytes));
});

test('serialized selections and order validation command controlled actors without transferring their owner or admitting ordinary allies', () => {
    const f = sourcePlayers(6), context = new OrderActionContext();
    const actor = (id: number, owner: any) => ({ id, owner, rules: { selectable: true }, warpedOutTrait: { isActive: () => false } });
    const own = actor(1, f.player), controlled = actor(2, f.alias), allied = actor(3, f.ally);
    f.player.objects.push(own); f.alias.objects.push(controlled); f.ally.objects.push(allied);
    const selection = new SelectUnitsAction(f.game, context); selection.player = f.player; selection.unitIds = [1, 2, 3];
    const received = new SelectUnitsAction(f.game, context); received.player = f.player; received.unserialize(selection.serialize()); received.process();
    expect(context.getOrCreateSelection(f.player).getSelectedUnits()).toEqual([own, controlled]);
    class FixtureOrder extends Order { constructor() { super(0); } }
    const factory = { create: () => new FixtureOrder() };
    const order: any = new OrderUnitsAction(f.game, {}, context, factory);
    expect(order.validateOrders(f.player).map((order: any) => order.sourceObject.id)).toEqual([1, 2]);
    expect(controllableObjects(f.player)).toEqual([own, controlled]);
    expect(controlled.owner).toBe(f.alias); expect(f.alias.objects).toEqual([controlled]);
    context.getOrCreateSelection(f.player).update([allied]); expect(order.validateOrders(f.player)).toEqual([]);
    delete f.alias.campaignController;
    context.getOrCreateSelection(f.player).update([controlled]); expect(order.validateOrders(f.player)).toEqual([]);
});

test('source passive countries keep their side while neutral cash capture and ordinary combat countries use distinct source flags', () => {
    const f = sourcePlayers(7), passive = f.runtime.houses.get('Other1 House');
    expect(passive.country.side).toBe(0); expect(passive.country.isPassive()).toBe(true); expect(passive.isNeutral).toBe(true);
    expect(f.player.country.isPlayable()).toBe(false); expect(f.player.isNeutral).toBe(false);
    expect(f.alias.isNeutral).toBe(false); expect(f.runtime.houses.get('Civie1 House').isNeutral).toBe(true);
    const legacy = sourcePlayers(6); expect(legacy.runtime.houses.get('Other1 House').isNeutral).toBe(false);
    expect(f.player.campaignSemanticsVersion).toBe(7); expect(legacy.player.campaignSemanticsVersion).toBe(6);
    const sourceCash = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).getSection('CAOILD')!;
    const oil: any = { owner: passive, rules: { produceCashStartup: sourceCash.getNumber('ProduceCashStartup'),
        produceCashAmount: sourceCash.getNumber('ProduceCashAmount'), produceCashDelay: sourceCash.getNumber('ProduceCashDelay') } };
    const trait = new OilDerrickTrait(); passive.credits = 2000;
    trait[NotifySpawn.onSpawn](oil); trait[NotifyTick.onTick](oil); expect(passive.credits).toBe(2000);
    oil.owner = f.player; f.player.credits = 0; trait[NotifyOwnerChange.onChange](oil, passive);
    expect(f.player.credits).toBe(1000);
    for (let tick = 0; tick < 99; tick++) trait[NotifyTick.onTick](oil);
    expect(f.player.credits).toBe(1000); trait[NotifyTick.onTick](oil); expect(f.player.credits).toBe(1020);
});

test('the original Soviet 06 self-parent country label is finite while a real multi-country inheritance cycle remains an error', () => {
    const map = new IniFile(parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov06t.map').readAsString());
    expect(map.getSection('Neutral')!.getString('ParentCountry')).toBe('Neutral');
    const root: any = { name: 'Neutral', parentCountry: 'Neutral' };
    const rules: any = { hasCountry: () => true, getCountry: () => root };
    const unexpected = () => { throw Error('A registered self-label is not an unregistered parent'); };
    expect(Country.factory('Neutral', rules, unexpected).matchesCountry('Neutral')).toBe(true);
    expect(() => Country.factory('Neutral', rules)).toThrow('Cyclic');
    const cyclic: any = { A: { name: 'A', parentCountry: 'B' }, B: { name: 'B', parentCountry: 'A' } };
    rules.getCountry = (name: string) => cyclic[name];
    expect(() => Country.factory('A', rules, unexpected)).toThrow('Cyclic');
});
