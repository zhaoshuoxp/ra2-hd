import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { OverpoweredTrait } from '../../src/game/gameobject/trait/OverpoweredTrait';
import { PoweredTrait } from '../../src/game/gameobject/trait/PoweredTrait';
import { AttackTask } from '../../src/game/gameobject/task/AttackTask';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';
import { PowerLevel } from '../../src/game/player/trait/PowerTrait';
import { TaskStatus } from '../../src/game/gameobject/task/system/TaskStatus';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { campaignChargeApproach } from '../../src/game/campaign/CampaignChargedWeapon';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov05u.map').getBytes();
expect(sha256(bytes)).toBe('31c6883ce678c0bcede293c571a610d355319a7cd729d45560183ced152a5629');
const source = new CampaignDefinition('ra2', 'sov05u.map', new TextDecoder().decode(bytes));
const rules = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(source.ini);

test('new charging resolves the actual original linked receiver tag and walks its EnteredBy ring', () => {
    const human = {}, owner = { campaignChargingVersion: 1, campaignController: human };
    const row = [...source.ini.getSection('Structures')!.entries.values()].map(String).find(row => row.includes(',CAPARS01,'))!.split(',');
    const receiver = { owner: { isAi: true }, campaignMapWeaponRange: 200, tag: { id: row[6] },
        tile: { rx: Number(row[3]), ry: Number(row[4]) }, isBuilding: () => true, overpoweredTrait: {} };
    const game: any = { areFriendly: (unit: any) => unit.owner === human,
        campaign: { definition: source, resolveHouse: (number: number) => number === 20 ? owner : undefined,
            machine: { states: new Map([...source.triggers.values()].map(trigger => [trigger.id, { enabled: !trigger.disabled, fired: 0 }])) } },
        map: { tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry }) } } };
    const approach = campaignChargeApproach(game, { owner, tile: { rx: 43, ry: 36 } }, receiver);
    expect(approach?.wait).toBe(17);
    expect(source.cellTags.some(cell => cell.x === approach?.tile.rx && cell.y === approach?.tile.ry)).toBe(true);
    expect(receiver.owner.isAi).toBe(true);
});

function chargedBuilding(version?: number, secondary = false, power = PowerLevel.Low, turnedOn = false) {
    const owner = { campaignSemanticsVersion: version, powerTrait: { level: power } };
    const primaryWeapon = { rules: { name: 'EiffelBolt' } };
    const secondaryWeapon = secondary ? { rules: { name: 'OPCoilBolt' } } : undefined;
    const game: any = { map: { tiles: {}, tileOccupation: { getObjectsOnTile: () => [] } } };
    const target: any = { obj: {}, tile: {}, getBridge: () => undefined };
    const attack = new AttackTask(game, target, primaryWeapon); attack.status = TaskStatus.Running;
    const building: any = { owner, primaryWeapon, secondaryWeapon, rules: { power: -100 },
        isBuilding: () => true, isInfantry: () => false, isVehicle: () => false,
        unitOrderTrait: { getCurrentTask: () => attack } };
    building.overpoweredTrait = new OverpoweredTrait(building); building.poweredTrait = new PoweredTrait(building);
    building.poweredTrait.setTurnedOn(turnedOn);
    const chargers = Array.from({ length: 4 }, () => ({ owner, attackTrait: { currentTarget: { obj: building } } }));
    const charge = (count: number) => { for (const charger of chargers.slice(0, count)) building.overpoweredTrait.chargeFrom(charger); };
    return { owner, building, attack, chargers, charge, primaryWeapon, secondaryWeapon };
}

test('the unchanged original tower starts switched off and has only its source primary weapon', () => {
    const raw = [...source.ini.getSection('Structures')!.entries.values()].map(String).find(row => row.split(',')[1] === 'CAPARS01')!.split(',');
    expect(raw[0]).toBe('Other2 House'); expect(raw[9]).toBe('0');
    const tower = rules.getSection('CAPARS01')!;
    expect(tower.getString('Primary')).toBe('EiffelBolt'); expect(tower.getString('Secondary')).toBe('');
    expect(tower.getBool('Overpowerable')).toBe(true); expect(tower.getNumber('Power')).toBe(-100);
    expect(rules.getSection('EiffelBolt')!.getNumber('Damage')).toBe(2000);
    expect(source.triggers.get('0AD6A15C')!.actions[0].opcode).toBe(14);
});

test('real charging powers a switched-off source building and retains its primary attack across the third and fourth chargers', () => {
    const f = chargedBuilding(7);
    expect(f.building.poweredTrait.isPoweredOn()).toBe(false);
    f.charge(1); expect(f.building.poweredTrait.isPoweredOn()).toBe(false);
    f.charge(2); expect(f.building.poweredTrait.isPoweredOn()).toBe(true);
    expect(f.building.poweredTrait.isPoweredOn(true)).toBe(false);
    f.charge(4); expect(f.building.overpoweredTrait.isOverpowered()).toBe(true);
    expect(f.attack.isCancelling()).toBe(false); expect(f.attack.getWeapon()).toBe(f.primaryWeapon);
    expect(AttackTrait.prototype.selectDefaultWeapon.call({}, f.building)).toBe(f.primaryWeapon);
    expect(f.building.poweredTrait.isPoweredOn()).toBe(true);
    expect(f.building.poweredTrait.isPoweredOn(true)).toBe(false);
});

test('charger removal follows real target, life and exact ownership, then restores the original switched-off state', () => {
    const f = chargedBuilding(7); f.charge(4);
    f.chargers[0].owner = { ...f.owner }; (f.chargers[1] as any).isDestroyed = true;
    f.building.overpoweredTrait[NotifyTick.onTick](f.building);
    expect(f.building.poweredTrait.isPoweredOn()).toBe(true);
    f.chargers[2].attackTrait.currentTarget.obj = undefined;
    f.building.overpoweredTrait[NotifyTick.onTick](f.building);
    expect(f.building.poweredTrait.isPoweredOn()).toBe(false);
    (f.chargers[3] as any).isCrashing = true;
    f.building.overpoweredTrait[NotifyTick.onTick](f.building);
    expect(f.building.overpoweredTrait.hasChargersToPowerOn()).toBe(false);
    expect(f.attack.getWeapon()).toBe(f.primaryWeapon);
});

test('a real secondary still handles overcharge and external drain still disables charged power', () => {
    const f = chargedBuilding(7, true, PowerLevel.Normal, true); f.charge(1);
    expect(f.attack.getWeapon()).toBe(f.secondaryWeapon);
    f.owner.powerTrait.level = PowerLevel.Low; f.building.overpoweredTrait[NotifyTick.onTick](f.building);
    f.charge(3); expect(f.attack.getWeapon()).toBe(f.secondaryWeapon);
    f.building.drainedBy = new Set([{}]); expect(f.building.poweredTrait.isPoweredOn()).toBe(false);
    expect(f.building.poweredTrait.isPoweredOn(true)).toBe(false);
});

test('skirmish and version 5/6 journals retain their prior charging and attack cancellation behavior', () => {
    for (const version of [undefined, 5, 6]) {
        const f = chargedBuilding(version); f.charge(4);
        expect(f.building.poweredTrait.isPoweredOn()).toBe(false);
        expect(AttackTrait.prototype.selectDefaultWeapon.call({}, f.building)).toBeUndefined();
        expect(f.attack.isCancelling()).toBe(true);
    }
});
