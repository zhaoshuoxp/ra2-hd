import { beforeAll } from 'bun:test';
import { retailIni } from '../../test-support/resources';
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import { IniFile } from '../../../src/data/IniFile';
import { DeployerTrait } from '../../../src/game/gameobject/trait/DeployerTrait';
import { NotifyTick } from '../../../src/game/gameobject/trait/interface/NotifyTick';

let retail: IniFile;
beforeAll(() => { retail = retailIni('yr'); });

function fixture(name: string, primaryCooldown = 0, fireOnce = true) {
    const rules = retail.getSection(name)!;
    const pulse = retail.getSection(rules.getString('Secondary'))!;
    let tick = 0, secondaryCooldown = 0;
    const shots: { tick: number; target: any }[] = [];
    const secondary = {
        rules: { areaFire: true, fireOnce },
        getCooldownTicks: () => secondaryCooldown,
        resetCooldown: () => { secondaryCooldown = pulse.getNumber('ROF'); },
        fire: (target: any) => { shots.push({ tick, target }); secondaryCooldown = pulse.getNumber('ROF'); },
    };
    const primary = {
        getCooldownTicks: () => primaryCooldown,
        resetCooldown: () => { primaryCooldown = 200; },
    };
    const tile = {}, unit: any = {
        isInfantry: () => true, stance: 0, ammo: -1, art: { fireUp: 0 }, isFiring: false,
        onBridge: false, tile, rules: { undeployDelay: rules.getNumber('UndeployDelay') },
        primaryWeapon: primary, secondaryWeapon: secondary,
        armedTrait: { getDeployFireWeapon: () => secondary },
    };
    const trait = new DeployerTrait(unit);
    const world: any = { createTarget: (bridge: any, tile: any) => ({ bridge, tile }) };
    const advance = (count: number) => {
        for (let i = 0; i < count; i++) {
            tick++; primaryCooldown = Math.max(0, primaryCooldown - 1);
            secondaryCooldown = Math.max(0, secondaryCooldown - 1);
            trait[NotifyTick.onTick](unit, world);
        }
    };
    return { trait, unit, shots, advance };
}

for (const name of ['YURI', 'YURIPR']) {
    test(`${name} one-shot deployment waits for mind-control cooldown before starting auto-undeploy`, () => {
        const f = fixture(name, 200);
        f.trait.setDeployed(true);
        f.advance(200);
        expect(f.trait.isDeployed()).toBe(true);
        expect(f.shots).toHaveLength(0);
        f.advance(20);
        expect(f.shots).toHaveLength(1);
        expect(f.shots[0].target.tile).toBe(f.unit.tile);
        expect(f.trait.isDeployed()).toBe(true);
        f.advance(f.unit.rules.undeployDelay);
        expect(f.trait.isDeployed()).toBe(false);
        expect(f.shots).toHaveLength(1);
    });
}

test('pending one-shot deployment can still be cancelled explicitly and redeployed', () => {
    const f = fixture('YURIPR', 200);
    f.trait.setDeployed(true); f.advance(20); f.trait.setDeployed(false); f.advance(200);
    expect(f.shots).toHaveLength(0);
    expect(f.unit.isFiring).toBe(false);
    f.trait.setDeployed(true); f.advance(20);
    expect(f.shots).toHaveLength(1);
});

test('empty ammunition defers the one-shot countdown until the weapon can fire', () => {
    const f = fixture('YURIPR'); f.unit.ammo = 0;
    f.trait.setDeployed(true); f.advance(100);
    expect(f.trait.isDeployed()).toBe(true);
    expect(f.shots).toHaveLength(0);
    f.unit.ammo = 1; f.advance(3);
    expect(f.shots).toHaveLength(1);
});

test('continuous deployment and deployment without an AreaFire weapon retain their timer', () => {
    for (const areaFire of [true, false]) {
        const f = fixture('YURIPR', 200, false);
        f.unit.secondaryWeapon.rules.areaFire = areaFire;
        f.trait.setDeployed(true); f.advance(75);
        expect(f.trait.isDeployed()).toBe(false);
        expect(f.shots).toHaveLength(0);
    }
});
