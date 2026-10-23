import { unitHdFamiliesForEdition } from './renderable/builder/unitHdFamilies';
import { activeEdition } from '@/editions/activeEdition';
import { sharedYuriUnitHdIdentity } from './renderable/builder/sharedYuriUnitHd';
import { sharedAlliedUnitHdIdentity } from './renderable/builder/sharedAlliedUnitHd';
import type { LoadedRhinoHd } from './renderable/rhino/loadRhinoHd';
import type { LoadedConscriptHd } from './renderable/builder/loadConscriptHd';
import type { LoadedSovietUnitsHd } from './renderable/builder/loadSovietUnitsHd';
import type { VxlFamily } from './renderable/unitVxl/loadVxlFamily';
import { aggregatePowerPlantHd, type LoadedPowerPlantHd } from './renderable/builder/resolvePowerPlantHd';
import type { HdSpriteOverride } from './renderable/builder/HdSpriteOverride';
import { isSovietBuildingHdFamily, type SovietBuildingHdFamily } from './renderable/builder/sovietBuildingHdFamilies';
import { canonicalAlliedBuildingHdFamily, isAlliedBuildingHdFamily, type AlliedBuildingHdFamily } from './renderable/builder/alliedBuildingHdFamilies';
import { publishAlliedBuilding } from './renderable/builder/alliedBuildingDemand';
import { isYuriBuildingHdFamily, type YuriBuildingHdFamily } from './renderable/builder/yuriBuildingHdFamilies';
import { aggregateEnvironmentHd } from './renderable/builder/EnvironmentHd';
import { environmentHdContractForTheater } from './renderable/builder/environmentHdContract';
export class MissingImageError extends Error {
}
export class ImageFinder {
    static MissingImageError = MissingImageError;
    private images: Map<string, any>;
    private theater: any;
    private aggregateOverrides = new WeakMap<object, HdSpriteOverride>();
    constructor(images: Map<string, any>, theater: any, private conscriptHd?: LoadedConscriptHd,
        private powerPlantHd?: LoadedPowerPlantHd, readonly rhinoHd?: LoadedRhinoHd, private napowrHd?: LoadedPowerPlantHd,
        private sovietBuildingsHd: Partial<Record<SovietBuildingHdFamily | AlliedBuildingHdFamily | YuriBuildingHdFamily, LoadedPowerPlantHd>> = {},
        private sovietUnitsHd?: LoadedSovietUnitsHd, private edition: string = activeEdition) {
        this.images = images;
        this.theater = theater;
    }
    getHdOverride(image: any) {
        return image === this.conscriptHd?.image ? this.conscriptHd?.override
            : this.powerPlantHd?.overrides.get(image) ?? this.napowrHd?.overrides.get(image)
                ?? Object.values(this.sovietBuildingsHd).map(family => family?.overrides.get(image)).find(Boolean)
                ?? this.aggregateOverrides.get(image) ?? this.theater.environmentHd?.overrides.get(image);
    }
    getUnitHdOverride(identity: string, image: any) {
        const family = this.sovietUnitsHd?.families.get(this.sharedUnitHdIdentity(identity, image));
        const member = family?.members.get(image.filename);
        return member?.image === image ? member.override : this.getHdOverride(image);
    }
    bindUnitHd(identity: string, image: any, apply: (override?: HdSpriteOverride) => void) {
        return this.sovietUnitsHd?.bind?.(this.sharedUnitHdIdentity(identity, image), image, apply) ?? (() => {});
    }
    private sharedUnitHdIdentity(identity: string, image: any) {
        return sharedYuriUnitHdIdentity(sharedAlliedUnitHdIdentity(identity, image), image, this.edition);
    }
    bindUnitVxlHd(identity: string, apply: (family?: VxlFamily) => void) {
        return this.sovietUnitsHd?.bindVxl?.(identity, apply) ?? (() => {});
    }
    hasUnitVxlHd(identity: string): boolean {
        return !!(this.sovietUnitsHd?.families.get(identity) as { vxl?: VxlFamily } | undefined)?.vxl;
    }
    bindUnitAnimationHd(identity: string, animation: string, image: any, apply: (override?: HdSpriteOverride) => void) {
        const declared = (identity === 'SQD' && animation === 'SQDG' && image.filename === 'sqdg.shp')
            || (identity === 'SCHP' && animation === 'SCHPDEPL' && image.filename === 'schpdepl.shp');
        if (!declared) return () => {};
        return this.bindUnitHd(identity, image, apply);
    }
    bindUnitProjectileHd(projectile: any, image: any, apply: (override?: HdSpriteOverride) => void) {
        const identity = projectile.fromObject?.name;
        const family = unitHdFamiliesForEdition(this.edition)[identity];
        if (!projectile.fromWeapon.rules.limboLaunch || !family?.projectiles.some(entry =>
            entry.projectile === projectile.rules.name && entry.weapon === projectile.fromWeapon.rules.name
            && entry.member === image.filename)) return () => {};
        return this.bindUnitHd(identity, image, apply);
    }
    getUnitProjectileHdOverride(projectile: any, image: any) {
        const identity = projectile.fromObject?.name;
        const contract = unitHdFamiliesForEdition(this.edition)[identity];
        if (!projectile.fromWeapon.rules.limboLaunch || !contract?.projectiles.some(entry =>
            entry.projectile === projectile.rules.name && entry.weapon === projectile.fromWeapon.rules.name
            && entry.member === image.filename)) return;
        return this.getUnitHdOverride(identity, image);
    }
    getBuildingTurretHd(name: string) {
        return isSovietBuildingHdFamily(name) || isAlliedBuildingHdFamily(name) || isYuriBuildingHdFamily(name)
            ? this.sovietBuildingsHd[name]?.turret : undefined;
    }
    hasWallHdDemand(name: string): boolean {
        const environment = environmentHdContractForTheater(this.theater.type)?.identities[this.edition]?.[name];
        return (name === 'GAWALL' || name === 'NAWALL' || name === 'GAFWLL')
            && !(environment && this.theater.environmentHd?.families.has(environment))
            && !!this.sovietUnitsHd?.bindBuilding && !!this.sovietUnitsHd.report.families[name];
    }
    bindWallHd(name: string, image: any, apply: (override?: HdSpriteOverride) => void) {
        if (!this.hasWallHdDemand(name)) return () => {};
        return this.sovietUnitsHd?.bindBuilding?.(name, loaded => {
            publishAlliedBuilding(this.sovietBuildingsHd, name, loaded);
            apply(this.getHdOverride(image));
        }) ?? (() => {});
    }
    bindBuildingHd(name: string, aggregate: { imageIndexes: Map<object, number> }, apply: (override?: HdSpriteOverride) => void) {
        return this.sovietUnitsHd?.bindBuilding?.(canonicalAlliedBuildingHdFamily(name), loaded => {
            publishAlliedBuilding(this.sovietBuildingsHd, name, loaded);
            this.aggregateOverrides.delete(aggregate);
            apply(this.getBuildingHdOverride(name, aggregate));
        }) ?? (() => {});
    }
    getBuildingHdOverride(name: string, aggregate: { imageIndexes: Map<object, number> }) {
        const environment = environmentHdContractForTheater(this.theater.type)?.identities[this.edition]?.[name];
        const family = environment && this.theater.environmentHd?.families.get(environment);
        if (family) {
            let override = this.aggregateOverrides.get(aggregate);
            if (!override) {
                const frames = [...aggregate.imageIndexes].flatMap(([image, offset]) =>
                    Array.from({ length: family.get(image)?.frames.length ?? 0 }, (_, nativeFrame) =>
                        ({ image, nativeFrame, offset: offset + nativeFrame })));
                if ([...family.keys()].some(image => !aggregate.imageIndexes.has(image))) return;
                const view = aggregateEnvironmentHd(frames, family);
                if (view) {
                    const arranged: HdSpriteOverride['frames'] = [];
                    frames.forEach((frame, index) => { arranged[frame.offset] = view.frames[index]; });
                    override = { ...view, frames: arranged };
                    this.aggregateOverrides.set(aggregate, override);
                }
            }
            return override;
        }
        if (name !== 'GAPOWR' && name !== 'NAPOWR' && !isSovietBuildingHdFamily(name)
            && !isAlliedBuildingHdFamily(name) && !isYuriBuildingHdFamily(name)) return;
        const loaded = name === 'NAPOWR' ? this.napowrHd : name === 'GAPOWR' ? this.powerPlantHd
            : this.sovietBuildingsHd[canonicalAlliedBuildingHdFamily(name)];
        if (!loaded?.overrides.size) return;
        let override = this.aggregateOverrides.get(aggregate);
        if (!override) {
            override = aggregatePowerPlantHd(aggregate, loaded, name);
            if (override) this.aggregateOverrides.set(aggregate, override);
        }
        return override;
    }
    registerAggregateHd(image: object, frames: { image: object; nativeFrame: number }[]) {
        const override = aggregateEnvironmentHd(frames, this.theater.environmentHd?.overrides ?? new Map());
        if (override) this.aggregateOverrides.set(image, override);
    }
    findByObjectArt(objectArt: {
        imageName: string;
        useTheaterExtension: boolean;
    }) {
        return this.find(objectArt.imageName, objectArt.useTheaterExtension);
    }
    find(artName: string, useTheaterExtension: boolean) {
        const filename = this.getFilename(artName, useTheaterExtension);
        const image = this.images.get(filename);
        if (!image) {
            throw new MissingImageError(`No image file found for artName="${artName}" (file=${filename})`);
        }
        return image;
    }
    tryFind(artName: string, useTheaterExtension: boolean) {
        let image;
        try {
            image = this.find(artName, useTheaterExtension);
        }
        catch (error) {
            if (!(error instanceof MissingImageError))
                throw error;
        }
        return image;
    }
    getFilename(artName: string, useTheaterExtension: boolean) {
        let filename = artName.toLowerCase();
        filename += useTheaterExtension ? this.theater.settings.extension : ".shp";
        filename = this.applyNewTheaterIfNeeded(artName, filename);
        return filename;
    }
    applyNewTheaterIfNeeded(artName: string, filename: string) {
        const firstChar = artName[0];
        const secondChar = artName[1];
        if (["G", "N", "C", "Y"].indexOf(firstChar) === -1 ||
            ["A", "T", "U", "D", "L", "N"].indexOf(secondChar) === -1) {
            return filename;
        }
        return this.applyNewTheater(filename);
    }
    applyNewTheater(filename: string) {
        const firstChar = filename[0];
        const rest = filename.substr(2);
        const newTheaterChar = this.theater.settings.newTheaterChar.toLowerCase();
        let newFilename = firstChar + newTheaterChar + rest;
        if (this.images.has(newFilename)) {
            return newFilename;
        }
        newFilename = firstChar + "g" + rest;
        if (this.images.has(newFilename)) {
            return newFilename;
        }
        return filename;
    }
}
