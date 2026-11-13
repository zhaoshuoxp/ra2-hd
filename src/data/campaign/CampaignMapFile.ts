import { MapFile } from '../MapFile';
import { CampaignDefinition, waypointNumber } from './CampaignDefinition';
import { TriggerActionType } from '../map/trigger/TriggerActionType';
import { TriggerEventType } from '../map/trigger/TriggerEventType';
import { VirtualFile } from '../vfs/VirtualFile';
import { activeEdition } from '../../editions/activeEdition';
import type { CampaignSourcePolicy } from './CampaignDormantRecords';

// This loader is deliberately distinct from the multiplayer parser: no numeric
// instruction is removed merely because the legacy enums do not recognize it.
export class CampaignMapFile extends MapFile {
    declare campaignDefinition: CampaignDefinition;
    declare campaignFilename?: string;
    private sourcePolicy?: CampaignSourcePolicy;
    get campaignSemanticsVersion(): number { return this.sourcePolicy?.semanticsVersion ?? 1; }

    constructor(file?: VirtualFile, sourcePolicy?: CampaignSourcePolicy) {
        super();
        this.sourcePolicy = sourcePolicy;
        if (file) this.fromVirtualFile(file);
    }

    fromVirtualFile(file: VirtualFile): this {
        this.campaignFilename = file.filename.toLowerCase();
        return super.fromVirtualFile(file);
    }

    readTagsAndTriggers(): void {
        const definition = new CampaignDefinition(activeEdition, this.campaignFilename ?? 'sov01t.map', this.toString(), undefined, this.sourcePolicy);
        definition.assertValid();
        this.campaignDefinition = definition;
        this.tags = [...definition.tags.values()].map(tag => ({ id: tag.id, repeatType: tag.repeat,
            name: tag.name, triggerId: tag.trigger }));
        this.triggers = [...definition.triggers.values()].map(trigger => ({ id: trigger.id, name: trigger.name,
            houseName: trigger.house, disabled: trigger.disabled, attachedTriggerId: trigger.linked,
            difficulties: { easy: trigger.difficulties.easy, medium: trigger.difficulties.normal, hard: trigger.difficulties.hard },
            events: trigger.events.map(event => ({ triggerId: trigger.id, eventIndex: event.index, type: event.opcode,
                params: event.params })),
            actions: trigger.actions.map(action => ({ triggerId: trigger.id, index: action.index, type: action.opcode,
                params: [Number(action.params[0]), ...action.params.slice(1, 6),
                    /^[A-Z]+$/i.test(action.params[6]) ? waypointNumber(action.params[6]) : Number(action.params[6])] })),
            tag: this.tags.find(tag => tag.triggerId === trigger.id) }));
        this.unknownEventTypes = new Set([...definition.triggers.values()].flatMap(trigger => trigger.events)
            .filter(event => TriggerEventType[event.opcode] === undefined).map(event => event.opcode));
        this.unknownActionTypes = new Set([...definition.triggers.values()].flatMap(trigger => trigger.actions)
            .filter(action => TriggerActionType[action.opcode] === undefined).map(action => action.opcode));
    }
}
