import type { CampaignDefinition } from '../../data/campaign/CampaignDefinition';
import type { CampaignTriggerMachine } from './CampaignTriggerMachine';

// A parallel timed cleanup can consume the attached startup tag while a late
// MCV is still deploying. The opt-in repair retains the already enabled source
// production timer and its original action list; it does not grant buildings.
export function recoverSourceBaseActivation(definition: CampaignDefinition, machine: CampaignTriggerMachine,
    house: (reference: string | number) => any): string[] {
    const recovered: string[] = [];
    for (const trigger of definition.triggers.values()) {
        const state = machine.states.get(trigger.id)!;
        if (!state.enabled || !state.finished || state.fired || trigger.events.length !== 1
            || trigger.events[0].opcode !== 13 || !trigger.actions.length
            || trigger.actions.some(action => ![3, 74, 32, 53].includes(action.opcode))
            || !trigger.actions.some(action => action.opcode === 3)) continue;
        const owner = house(trigger.house);
        if (owner.defeated || !definition.ini.getSection(owner.name)?.getNumber('NodeCount')
            || ![...owner.buildings].some((b: any) => b.isSpawned && !b.isDestroyed && b.rules.constructionYard)
            || trigger.actions.filter(action => [3, 74].includes(action.opcode))
                .some(action => house(Number(action.params[1])) !== owner)) continue;
        if ([...definition.triggers.values()].some(record => record.actions.some(action =>
            action.opcode === 12 && action.params[1] === trigger.id))) continue;
        const enablerFired = [...definition.triggers.values()].some(gate => machine.states.get(gate.id)?.fired
            && gate.house === trigger.house && gate.events.some(event => event.opcode === 32)
            && gate.actions.some(action => action.opcode === 53 && action.params[1] === trigger.id));
        if (!enablerFired) continue;
        state.finished = false;
        recovered.push(trigger.id);
    }
    return recovered;
}
