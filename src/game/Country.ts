import { ObjectType } from '@/engine/type/ObjectType';
import { SideType } from './SideType';
interface CountryRules {
    id: string;
    side: SideType;
    name: string;
    multiplay: boolean;
    multiplayPassive: boolean;
    veteranAircraft: string[];
    veteranInfantry: string[];
    veteranUnits: string[];
    parentCountry?: string;
    getCountry(id: string): CountryRules;
    hasCountry?(id: string): boolean;
}
export class Country {
    private rules: CountryRules;
    static factory(id: string, rules: CountryRules, unregisteredParent?: (country: string, parent: string) => void,
        inheritParents = true): Country {
        const country = rules.getCountry(id), parents: CountryRules[] = [], seen = new Set([id]);
        if (!inheritParents) return new this(country, parents, false);
        let name = country.parentCountry;
        if (unregisteredParent && name === country.name) name = undefined;
        while (name) {
            if (seen.has(name)) throw new Error(`Cyclic parent country: ${id}`);
            seen.add(name);
            if (rules.hasCountry?.(name) === false && unregisteredParent) {
                unregisteredParent(id, name); break;
            }
            const parent = rules.getCountry(name); parents.push(parent);
            name = unregisteredParent && parent.parentCountry === parent.name ? undefined : parent.parentCountry;
        }
        return new this(country, parents);
    }
    constructor(rules: CountryRules, private readonly parents: CountryRules[] = [], private readonly inheritParents = true) {
        this.rules = rules;
    }
    matchesCountry(name: string): boolean {
        return this.name === name || this.inheritParents
            && (this.rules.parentCountry === name || this.parents.some(parent => parent.name === name));
    }
    get id(): string {
        return this.rules.id;
    }
    get side(): SideType {
        return this.rules.side;
    }
    get name(): string {
        return this.rules.name;
    }
    isPlayable(): boolean {
        return this.rules.multiplay && !this.rules.multiplayPassive;
    }
    isPassive(): boolean {
        return !!this.rules.multiplayPassive;
    }
    hasVeteranUnit(type: ObjectType, name: string): boolean {
        let veteranUnits: string[];
        switch (type) {
            case ObjectType.Aircraft:
                veteranUnits = this.rules.veteranAircraft;
                break;
            case ObjectType.Infantry:
                veteranUnits = this.rules.veteranInfantry;
                break;
            case ObjectType.Vehicle:
                veteranUnits = this.rules.veteranUnits;
                break;
            default:
                throw new Error(`Unsupported object type "${ObjectType[type]}"`);
        }
        return veteranUnits.includes(name) || this.parents.some(parent =>
            (type === ObjectType.Aircraft ? parent.veteranAircraft : type === ObjectType.Infantry ? parent.veteranInfantry : parent.veteranUnits).includes(name));
    }
}
