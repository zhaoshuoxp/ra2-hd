import type { IniFile } from '../IniFile';
import type { CampaignDefinition } from './CampaignDefinition';

export interface CampaignMediaReference {
    name: string;
    binding: string;
    use: 'before-mission' | 'after-mission' | 'fullscreen' | 'transmission' | 'transmission-paused';
    movieIndex?: number;
}

// FAData.ini from the EA-published original mission editor identifies action 48
// as camera movement. Movie actions are 10, 100 and 117; script 26 uses radar.
export function campaignMediaReferences(definition: CampaignDefinition, art: IniFile): CampaignMediaReference[] {
    const movies = [...(art.getSection('Movies')?.entries.values() ?? [])].map(String), refs: CampaignMediaReference[] = [];
    const add = (name: string, binding: string, use: CampaignMediaReference['use'], movieIndex?: number) => {
        if (name && name.toLowerCase() !== '<none>') refs.push({ name: name.toLowerCase(), binding, use,
            ...(movieIndex === undefined ? {} : { movieIndex }) });
    };
    const indexed = (index: number, binding: string, use: CampaignMediaReference['use']) => {
        if (!Number.isSafeInteger(index) || index < 0 || !movies[index]) throw new Error(`Unknown original movie index at ${binding}: ${index}`);
        add(movies[index], binding, use, index);
    };
    for (const field of ['Intro', 'Brief', 'Win', 'Lose', 'Action', 'PostScore', 'PreMapSelect']) {
        add(definition.ini.getSection('Basic')!.getString(field), `Basic.${field}`,
            field === 'Intro' || field === 'Brief' ? 'before-mission' : 'after-mission');
    }
    for (const trigger of definition.triggers.values()) for (const action of trigger.actions) {
        if ([10, 100, 117].includes(action.opcode)) indexed(Number(action.params[1]), `Actions.${action.key}:${action.index}`,
            action.opcode === 10 ? 'fullscreen' : action.opcode === 117 ? 'transmission-paused' : 'transmission');
    }
    for (const script of definition.scripts.values()) for (const line of script.instructions) {
        if (line.opcode === 26) indexed(Number(line.params[0]), `Script.${line.section}:${line.index}`, 'transmission');
    }
    return refs;
}
