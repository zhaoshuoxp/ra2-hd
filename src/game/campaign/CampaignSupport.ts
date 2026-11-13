import type { CampaignDefinition, CampaignDiagnostic, CampaignInstruction } from '../../data/campaign/CampaignDefinition';
import { campaignAiConditions } from './CampaignAi';

export interface CampaignCapabilities {
    events: ReadonlySet<number>;
    actions: ReadonlySet<number>;
    scripts: ReadonlySet<number>;
    subsystems: readonly { id: string; ready: boolean; reason: string }[];
}
export const triggerMachineActions = new Set([12, 22, 53, 54, 56, 57]);
export const triggerMachineEvents = new Set([8, 13, 36, 37, 47, 51]);
export const campaignAttackTargetCategories = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export function campaignPreflight(definition: CampaignDefinition, capabilities: CampaignCapabilities): CampaignDiagnostic[] {
    const diagnostics = [...definition.blockingDiagnostics];
    const check = (instruction: CampaignInstruction, supported: ReadonlySet<number>, kind: string) => {
        if (!supported.has(instruction.opcode)) diagnostics.push({ section: instruction.section, key: instruction.key,
            index: instruction.index, raw: instruction.raw, reason: `${kind} opcode ${instruction.opcode} has no verified executor` });
    };
    for (const trigger of definition.triggers.values()) {
        trigger.events.forEach(event => check(event, capabilities.events, 'Event'));
        trigger.actions.forEach(action => check(action, capabilities.actions, 'Action'));
    }
    for (const script of definition.scripts.values()) if (!definition.dormantScripts.has(script.id)) script.instructions.forEach(line => {
        check(line, capabilities.scripts, 'Script');
        if (line.opcode === 0 && !campaignAttackTargetCategories.has(Number(line.params[0]))) diagnostics.push({
            section: line.section, key: line.key, index: line.index, raw: line.raw,
            reason: `Script attack target category ${line.params[0]} has no verified executor` });
    });
    for (const trigger of definition.aiTriggers.values()) {
        if (!campaignAiConditions.has(trigger.condition) || !Number.isInteger(trigger.comparison) || trigger.comparison < 0 || trigger.comparison > 5
            || !Number.isSafeInteger(trigger.count) || [trigger.weight, trigger.minimumWeight, trigger.maximumWeight].some(value => !Number.isFinite(value))) {
            diagnostics.push({ section: 'AITriggerTypes', key: trigger.id, raw: trigger.raw, reason: 'Unsupported AI condition or invalid comparison/weight' });
        }
    }
    for (const trigger of definition.triggers.values()) for (const action of trigger.actions) {
        if (action.opcode === 4 && definition.teams.get(action.params[1])?.properties.Full?.toLowerCase() === 'yes') {
            diagnostics.push({ section: 'Actions', key: action.key, index: action.index, raw: action.raw,
                reason: 'Recruiting a preloaded transport team requires a boarding executor; only reinforcement preloading is implemented' });
        }
    }
    for (const subsystem of capabilities.subsystems) if (!subsystem.ready) diagnostics.push({ section: 'Runtime',
        key: subsystem.id, raw: '', reason: subsystem.reason });
    return diagnostics;
}

export function assertCampaignPlayable(definition: CampaignDefinition, capabilities: CampaignCapabilities): void {
    const diagnostics = campaignPreflight(definition, capabilities);
    if (diagnostics.length) throw new Error('Campaign is diagnostic only:\n' + diagnostics.map(issue =>
        `[${issue.section}] ${issue.key}${issue.index === undefined ? '' : `:${issue.index}`} ${issue.reason}`).join('\n'));
}
