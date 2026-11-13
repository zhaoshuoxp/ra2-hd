import { IniFile } from '../IniFile';
import { campaignDormantRecords, type CampaignDormantRecord, type CampaignSourcePolicy } from './CampaignDormantRecords';

export type CampaignEdition = 'ra2' | 'yr';
export type CampaignDifficulty = 'easy' | 'normal' | 'hard';
export function isCampaignDifficulty(value: unknown): value is CampaignDifficulty {
    return value === 'easy' || value === 'normal' || value === 'hard';
}
export interface CampaignLocation { section: string; key: string; index?: number }
export interface CampaignDiagnostic extends CampaignLocation { reason: string; raw: string }
export interface CampaignInstruction extends CampaignLocation {
    opcode: number;
    params: string[];
    raw: string;
}
export function isNullCampaignTeamAction(action: CampaignInstruction): boolean {
    return action.opcode === 4 && action.params[0] === '0' && action.params[1] === '0';
}
export interface CampaignTrigger {
    id: string;
    house: string;
    linked?: string;
    name: string;
    disabled: boolean;
    transferOnHijack?: boolean;
    difficulties: Record<CampaignDifficulty, boolean>;
    events: CampaignInstruction[];
    actions: CampaignInstruction[];
}
export interface CampaignTag { id: string; repeat: number; name: string; trigger: string }
export interface CampaignHouse {
    id: string;
    country: string;
    playerControl: boolean;
    allies: string[];
    credits: number;
    techLevel: number;
    iq: number;
    edge: string;
    color: string;
}
export interface CampaignScript { id: string; name: string; instructions: CampaignInstruction[] }
export interface CampaignTaskForce { id: string; units: { count: number; type: string }[] }
export interface CampaignTeam {
    id: string;
    house: string;
    script: string;
    taskForce: string;
    properties: Record<string, string>;
    global?: boolean;
}
export interface CampaignAiTrigger {
    id: string;
    raw: string;
    name: string;
    team: string;
    secondTeam?: string;
    house: string;
    techLevel: number;
    condition: number;
    object: string;
    count: number;
    comparison: number;
    weight: number;
    minimumWeight: number;
    maximumWeight: number;
    enabled: boolean;
    difficulties: Record<CampaignDifficulty, boolean>;
    global?: boolean;
    skirmish?: boolean;
    side?: number;
}

export function waypointNumber(value: string): number {
    if (!/^[A-Z]+$/i.test(value)) throw new Error(`Invalid alphabetic waypoint: ${value}`);
    return [...value.toUpperCase()].reduce((number, char) => number * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

// Read the original records independently of MapFile's legacy warn-and-skip parser.
// Unknown opcodes remain instructions; support and syntax are separate decisions.
export class CampaignDefinition {
    readonly ini: IniFile;
    readonly diagnostics: CampaignDiagnostic[] = [];
    readonly triggers = new Map<string, CampaignTrigger>();
    readonly tags = new Map<string, CampaignTag>();
    readonly houses = new Map<string, CampaignHouse>();
    readonly teams = new Map<string, CampaignTeam>();
    readonly aiTriggers = new Map<string, CampaignAiTrigger>();
    readonly scripts = new Map<string, CampaignScript>();
    readonly taskForces = new Map<string, CampaignTaskForce>();
    readonly variables = new Map<string, { name: string; value: boolean }>();
    readonly waypoints = new Map<number, { x: number; y: number }>();
    readonly cellTags: { x: number; y: number; tag: string }[] = [];
    readonly dormantRecords: CampaignDormantRecord[];
    readonly dormantScripts: Set<string>;
    private dormantDiagnostics: CampaignDiagnostic[];
    private triggerTagIndex?: Map<string, CampaignTag[]>;
    private librarySections = new Set<string>();
    private globalTeams = new Set<string>();

    get hasGlobalAiLibrary(): boolean { return !!this.globalAi; }

    constructor(readonly edition: CampaignEdition, readonly filename: string, readonly source: string,
        private readonly globalAi?: IniFile, sourcePolicy?: CampaignSourcePolicy) {
        this.ini = new IniFile(source);
        if (globalAi) {
            for (const list of ['ScriptTypes', 'TaskForces', 'TeamTypes']) {
                for (const id of globalAi.getSection(list)?.entries.values() ?? []) this.librarySections.add(String(id));
            }
            this.globalTeams = new Set([...(globalAi.getSection('TeamTypes')?.entries.values() ?? [])].map(String));
        }
        this.read();
        const dormant = campaignDormantRecords(this, sourcePolicy);
        this.dormantRecords = dormant.records; this.dormantScripts = dormant.scripts; this.dormantDiagnostics = dormant.diagnostics;
    }

    private rows(section: string): [string, string][] {
        const local = [...(this.ini.getSection(section)?.entries ?? [])].map(([key, raw]) => [key, String(raw)] as [string, string]);
        if (!this.globalAi) return local;
        const global = [...(this.globalAi.getSection(section)?.entries ?? [])].map(([key, raw]) => [key, String(raw)] as [string, string]);
        if (['ScriptTypes', 'TaskForces', 'TeamTypes'].includes(section)) {
            // Numeric list keys restart in scenario files. Identity is the
            // referenced section, not its position in either source list.
            const identities = new Map([...global, ...local].map(([key, id]) => [id, key]));
            return [...identities].map(([id, key]) => [key, id]);
        }
        if (section === 'AITriggerTypes') {
            return this.ini.getSection('Basic')?.getBool('IgnoreGlobalAITriggers') ? local : [...new Map([...global, ...local])];
        }
        return this.librarySections.has(section) ? [...new Map([...global, ...local])] : local;
    }

    private error(section: string, key: string, raw: string, reason: string, index?: number): void {
        this.diagnostics.push({ section, key, raw, reason, ...(index === undefined ? {} : { index }) });
    }

    private readInstructions(section: 'Events' | 'Actions', key: string, raw: string): CampaignInstruction[] {
        const tokens = raw.split(',').map(value => value.trim());
        const count = Number(tokens.shift());
        const result: CampaignInstruction[] = [];
        if (!Number.isInteger(count) || count < 0 || count > 4096) {
            this.error(section, key, raw, 'Invalid instruction count');
            return result;
        }
        for (let index = 0; index < count; index++) {
            const opcodeToken = tokens.shift();
            const opcode = Number(opcodeToken);
            if (!opcodeToken || !Number.isSafeInteger(opcode) || opcode < 0) {
                this.error(section, key, raw, 'Invalid or missing opcode', index);
                break;
            }
            let length = 7;
            if (section === 'Events') {
                const mode = tokens[0];
                if (!['0', '1', '2'].includes(mode)) {
                    this.error(section, key, raw, `Unsupported event parameter encoding: ${mode}`, index);
                    break;
                }
                length = mode === '2' ? 3 : 2;
            }
            if (tokens.length < length) {
                this.error(section, key, raw, 'Truncated instruction parameters', index);
                break;
            }
            result.push({ section, key, index, opcode, params: tokens.splice(0, length), raw });
        }
        if (tokens.length) this.error(section, key, raw, `Unconsumed tokens: ${tokens.length}`);
        return result;
    }

    private read(): void {
        for (const [id, raw] of this.rows('Houses')) {
            const section = this.ini.getSection(raw);
            if (!section) { this.error('Houses', id, raw, 'Missing house section'); continue; }
            this.houses.set(raw, {
                id: raw, country: section.getString('Country'), playerControl: section.getBool('PlayerControl'),
                allies: section.getArray('Allies'), credits: section.getNumber('Credits') * 100,
                techLevel: section.getNumber('TechLevel'), iq: section.getNumber('IQ'),
                edge: section.getString('Edge'), color: section.getString('Color'),
            });
        }
        const player = this.ini.getSection('Basic')?.getString('Player');
        if (!player || !this.houses.has(player)) this.error('Basic', 'Player', player ?? '', 'Missing player house');
        for (const house of this.houses.values()) {
            for (const ally of house.allies) {
                if (!this.houses.has(ally)) this.error(house.id, 'Allies', ally, 'Unknown allied house');
            }
        }
        for (const [id, raw] of this.rows('Waypoints')) {
            const number = Number(id), packed = Number(raw);
            if (!Number.isSafeInteger(number) || !Number.isSafeInteger(packed) || packed < 0) {
                this.error('Waypoints', id, raw, 'Invalid waypoint coordinates');
            } else this.waypoints.set(number, { x: packed % 1000, y: Math.floor(packed / 1000) });
        }
        for (const [id, raw] of this.rows('VariableNames')) {
            const [name, initial] = raw.split(',');
            if (!/^[01]$/.test(initial)) this.error('VariableNames', id, raw, 'Invalid initial Boolean');
            this.variables.set(id, { name, value: initial === '1' });
        }
        for (const [id, raw] of this.rows('Triggers')) {
            const parts = raw.split(',');
            if (parts.length !== 8 || !parts.slice(3).every(value => /^[01]$/.test(value))) {
                this.error('Triggers', id, raw, 'Expected eight fields and Boolean flags');
                continue;
            }
            this.triggers.set(id, { id, house: parts[0], linked: parts[1] === '<none>' ? undefined : parts[1],
                name: parts[2], disabled: parts[3] === '1', transferOnHijack: parts[7] === '1',
                difficulties: { easy: parts[4] === '1', normal: parts[5] === '1', hard: parts[6] === '1' },
                events: [], actions: [] });
        }
        for (const section of ['Events', 'Actions'] as const) {
            for (const [id, raw] of this.rows(section)) {
                const instructions = this.readInstructions(section, id, raw);
                const trigger = this.triggers.get(id);
                if (!trigger) this.error(section, id, raw, 'Unknown trigger');
                else trigger[section === 'Events' ? 'events' : 'actions'] = instructions;
            }
        }
        for (const trigger of this.triggers.values()) {
            // An explicit zero-count action list is a valid empty program.
            // Missing or truncated records must still fail validation.
            const emptyActions = this.ini.getSection('Actions')?.getString(trigger.id).trim() === '0';
            if (!trigger.events.length || !trigger.actions.length && !emptyActions) {
                this.error('Triggers', trigger.id, '', 'Trigger requires events and actions');
            }
            const visited = new Set([trigger.id]);
            let linked = trigger.linked;
            while (linked) {
                if (visited.has(linked) || !this.triggers.has(linked)) {
                    this.error('Triggers', trigger.id, linked, 'Missing or cyclic linked trigger'); break;
                }
                visited.add(linked); linked = this.triggers.get(linked)!.linked;
            }
        }
        for (const [id, raw] of this.rows('Tags')) {
            const [repeat, name, trigger, ...extra] = raw.split(',');
            if (!['0', '1', '2'].includes(repeat) || extra.length || !this.triggers.has(trigger)) {
                this.error('Tags', id, raw, 'Invalid tag or trigger reference');
            }
            this.tags.set(id, { id, repeat: Number(repeat), name, trigger });
        }
        for (const [id, raw] of this.rows('CellTags')) {
            const packed = Number(id);
            if (!this.tags.has(raw) || !Number.isSafeInteger(packed)) this.error('CellTags', id, raw, 'Invalid tag or coordinates');
            this.cellTags.push({ x: packed % 1000, y: Math.floor(packed / 1000), tag: raw });
        }
        for (const [, id] of this.rows('ScriptTypes')) {
            const instructions: CampaignInstruction[] = [];
            for (const [key, raw] of this.rows(id)) {
                if (!/^\d+$/.test(key)) continue;
                const parts = raw.split(',');
                if (parts.length !== 2 || !parts.every(value => /^-?\d+$/.test(value))) {
                    this.error(id, key, raw, 'Expected integer script opcode and argument'); continue;
                }
                instructions.push({ section: id, key, index: Number(key), opcode: Number(parts[0]), params: [parts[1]], raw });
            }
            instructions.sort((a, b) => a.index! - b.index!);
            if (instructions.some((line, index) => line.index !== index)) this.error(id, '', '', 'Non-contiguous script lines');
            this.scripts.set(id, { id, name: this.rows(id).find(([key]) => key.toLowerCase() === 'name')?.[1] ?? '', instructions });
        }
        for (const [, id] of this.rows('TaskForces')) {
            const units: CampaignTaskForce['units'] = [];
            for (const [key, raw] of this.rows(id)) {
                if (!/^\d+$/.test(key)) continue;
                const [count, type, ...extra] = raw.split(',');
                if (!/^\d+$/.test(count) || Number(count) <= 0 || !type || extra.length) {
                    this.error(id, key, raw, 'Invalid task force composition'); continue;
                }
                units.push({ count: Number(count), type });
            }
            this.taskForces.set(id, { id, units });
        }
        for (const [, id] of this.rows('TeamTypes')) {
            const properties = Object.fromEntries(this.rows(id));
            const { House: house, Script: script, TaskForce: taskForce } = properties;
            const global = this.globalTeams.has(id);
            if (!this.scripts.has(script) || !this.taskForces.has(taskForce)) this.error(id, '', '', 'Missing script or task force');
            if (!(global && house?.toLowerCase() === '<none>')
                && ![...this.houses.values()].some(entry => entry.country === house || entry.id === house)) {
                this.error(id, 'House', house, 'Unknown team house');
            }
            for (const key of ['Waypoint', 'TransportWaypoint']) {
                if (properties[key]) {
                    try {
                        if (!this.waypoints.has(waypointNumber(properties[key]))) this.error(id, key, properties[key], 'Missing waypoint');
                    } catch (error) { this.error(id, key, properties[key], String(error)); }
                }
            }
            this.teams.set(id, { id, house, script, taskForce, properties, ...(this.globalAi ? { global } : {}) });
        }
        for (const [id, raw] of this.rows('AITriggerTypes')) {
            const p = raw.split(',');
            if (p.length !== 18 || !/^[a-f0-9]{64}$/i.test(p[6])) {
                this.error('AITriggerTypes', id, raw, 'Expected 18 fields and a 32-byte condition'); continue;
            }
            const bytes = new Uint8Array(p[6].match(/../g)!.map(byte => parseInt(byte, 16)));
            const data = new DataView(bytes.buffer);
            const mapEnable = this.ini.getSection('AITriggerTypesEnable');
            const enabled = this.globalAi && !mapEnable?.has(id)
                ? this.globalAi.getSection('AITriggerTypesEnable')?.getBool(id, true) ?? true
                : mapEnable?.getBool(id) ?? true;
            if (!this.teams.has(p[1]) || (p[14] !== '<none>' && !this.teams.has(p[14]))) {
                this.error('AITriggerTypes', id, raw, 'Missing team reference');
            }
            this.aiTriggers.set(id, { id, raw, name: p[0], team: p[1], house: p[2], techLevel: Number(p[3]),
                condition: Number(p[4]), object: p[5], count: data.getInt32(0, true), comparison: data.getInt32(4, true),
                weight: Number(p[7]), minimumWeight: Number(p[8]), maximumWeight: Number(p[9]), enabled,
                secondTeam: p[14] === '<none>' ? undefined : p[14],
                difficulties: { easy: p[15] === '1', normal: p[16] === '1', hard: p[17] === '1' },
                ...(this.globalAi ? { global: !this.ini.getSection('AITriggerTypes')?.has(id), skirmish: p[10] === '1', side: Number(p[12]) } : {}) });
        }
        for (const trigger of this.triggers.values()) {
            for (const action of trigger.actions) {
                const parameter = action.params[1];
                if ([4, 5, 7, 80, 107].includes(action.opcode) && !isNullCampaignTeamAction(action) && !this.teams.has(parameter)) {
                    this.error('Actions', trigger.id, action.raw, `Missing team: ${parameter}`, action.index);
                }
                if ([12, 22, 53, 54].includes(action.opcode) && parameter !== '0' && !this.triggers.has(parameter)) {
                    this.error('Actions', trigger.id, action.raw, `Missing trigger: ${parameter}`, action.index);
                }
            }
        }
    }

    get blockingDiagnostics(): CampaignDiagnostic[] { return this.diagnostics.filter(issue => !this.dormantDiagnostics.includes(issue)); }

    assertValid(): void {
        if (this.blockingDiagnostics.length) throw new Error(this.blockingDiagnostics.map(issue =>
            `[${issue.section}] ${issue.key}${issue.index === undefined ? '' : `:${issue.index}`} - ${issue.reason}`).join('\n'));
    }

    triggerChain(id: string): string[] {
        const chain: string[] = [];
        while (id) {
            if (chain.includes(id)) throw new Error(`Cyclic campaign trigger chain: ${id}`);
            const trigger = this.triggers.get(id);
            if (!trigger) throw new Error(`Missing campaign trigger: ${id}`);
            chain.push(id); id = trigger.linked ?? '';
        }
        return chain;
    }

    tagsForTrigger(id: string): CampaignTag[] {
        if (!this.triggerTagIndex) {
            this.triggerTagIndex = new Map();
            for (const tag of this.tags.values()) for (const id of this.triggerChain(tag.trigger)) {
                const tags = this.triggerTagIndex.get(id) ?? [];
                tags.push(tag); this.triggerTagIndex.set(id, tags);
            }
        }
        return this.triggerTagIndex.get(id) ?? [];
    }
}
