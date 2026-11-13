import type { CampaignDefinition, CampaignDiagnostic } from './CampaignDefinition';

export interface CampaignSourcePolicy { semanticsVersion: number; sourceSha256: string }
export interface CampaignDormantRecord { section: string; key: string; reason: string }

// Exact original-source admissions retain the records and their diagnostics.
// They never supply an executor or make a mission publicly playable.
export function campaignDormantRecords(definition: CampaignDefinition, policy?: CampaignSourcePolicy): {
    records: CampaignDormantRecord[]; diagnostics: CampaignDiagnostic[]; scripts: Set<string>;
} {
    const result = { records: [] as CampaignDormantRecord[], diagnostics: [] as CampaignDiagnostic[], scripts: new Set<string>() };
    if (policy && policy.semanticsVersion >= 28 && definition.edition === 'yr') {
        const sources: Record<string, { hash: string; empty: string[]; nullReinforcement?: string }> = {
            'all03umd.map': { hash: 'b84a2e689cc00f0be064ecbfcd385635ac037f28bf8f72c02b426a0e52ff1547',
                empty: ['096E6B9C', '096E6AAC', '096E69BC', '094CE3EC'], nullReinforcement: '09794DFC' },
            'sov05umd.map': { hash: '22518e8b4a86331a9172048e10de13b45c2826ea4fdf4d2203b58994b897761b', empty: ['079B75FC'] },
        };
        const source = sources[definition.filename];
        if (!source || source.hash !== policy.sourceSha256) return result;
        for (const id of source.empty) {
            if (definition.ini.getSection('Events')?.getString(id) !== '0'
                || definition.ini.getSection('Actions')?.getString(id) !== '0') continue;
            result.diagnostics.push(...definition.diagnostics.filter(issue => issue.section === 'Triggers' && issue.key === id
                && issue.reason === 'Trigger requires events and actions'));
            result.records.push({ section: 'Triggers', key: id,
                reason: 'Exact source empty event/action program: no event can satisfy it and forced dispatch has no actions. Tags and linked records remain intact.' });
        }
        const id = source.nullReinforcement;
        if (id && definition.ini.getSection('Actions')?.getString(id) === '1,7,0,0,0,0,0,0,A' && !definition.teams.has('0')) {
            result.diagnostics.push(...definition.diagnostics.filter(issue => issue.section === 'Actions' && issue.key === id
                && issue.index === 0 && issue.reason === 'Missing team: 0'));
            result.records.push({ section: 'Actions', key: id,
                reason: 'Exact original null reinforcement TeamType pointer. The YR SpawnTeam handler returns failure without creating units; source trigger conditions remain intact.' });
        }
        return result;
    }
    if (policy && policy.semanticsVersion >= 26 && definition.edition === 'ra2' && definition.filename === 'trn01t.map'
        && policy.sourceSha256 === '4dcec9e12f2541e4c15bf1e7da78c6ff74932c794837c35029a02de5bf43cd71') {
        const id = '075109EC', orphan = '0AD657AC';
        const actions = [...definition.triggers.values()].flatMap(trigger => trigger.actions);
        const transitions = [...definition.scripts.values()].filter(script => script.id !== orphan)
            .some(script => script.instructions.some(line => [17, 18].includes(line.opcode)));
        if (!transitions && definition.ini.getSection('Triggers')?.getString(id) === 'Americans,<none>,075109EC,0,1,1,1,0'
            && definition.ini.getSection('Events')?.getString(id) === '0'
            && definition.ini.getSection('Actions')?.getString(id) === '0'
            && ![...definition.tags.values()].some(tag => definition.triggerChain(tag.trigger).includes(id))
            && !actions.some(action => action.params.includes(id))) {
            result.diagnostics = definition.diagnostics.filter(issue => issue.section === 'Triggers' && issue.key === id
                && issue.reason === 'Trigger requires events and actions');
            result.records.push({ section: 'Triggers', key: id,
                reason: 'Exact original empty event/action lists have no tag, linked incoming chain or force/enable action; retained inert' });
        }
        if (definition.hasGlobalAiLibrary && !transitions
            && definition.scripts.get(orphan)?.instructions.map(line => line.raw).join(';') === '20,19;18,362'
            && ![...definition.teams.values()].some(team => team.script === orphan)) {
            result.scripts.add(orphan); result.records.push({ section: 'ScriptTypes', key: orphan,
                reason: 'No original or expanded-library team references this script; no reachable script/team transition exists' });
        }
        return result;
    }
    if (policy && policy.semanticsVersion >= 20 && definition.edition === 'ra2' && definition.filename === 'all06u.map'
        && policy.sourceSha256 === '9e02b8fa4c570000c2bb34c9b0e702b143e2e93ae529faa36556e1f43af0f922'
        && definition.ini.getSection('Basic')?.getBool('IgnoreGlobalAITriggers')) {
        const id = '0979640C', trigger = definition.triggers.get(id);
        const incoming = [...definition.triggers.values()].filter(entry => definition.triggerChain(entry.id).includes(id));
        const ids = new Set(incoming.map(entry => entry.id));
        const actions = [...definition.triggers.values()].flatMap(entry => entry.actions);
        if (trigger?.actions[0]?.raw === '2,7,0,0,0,0,0,0,A,57,0,13,0,0,0,0,A'
            && incoming.length === 8 && incoming.every(entry => entry.disabled)
            && !actions.some(action => [22, 53].includes(action.opcode) && ids.has(action.params[1]))
            && ![...definition.scripts.values()].some(script => script.instructions.some(line => [17, 18].includes(line.opcode)))) {
            result.diagnostics = definition.diagnostics.filter(issue => issue.section === 'Actions' && issue.key === id
                && issue.index === 0 && issue.reason === 'Missing team: 0');
            result.records.push({ section: 'Actions', key: id,
                reason: 'Original null reinforcement has eight source-disabled incoming chain members and no force/enable action; global AI is ignored and no script transition exists' });
        }
        return result;
    }
    if (policy && policy.semanticsVersion >= 16 && definition.edition === 'ra2' && definition.filename === 'all02s.map'
        && policy.sourceSha256 === '5ebd7a3aaa60215a6da1f63e87a53c4ebf8cb28378b09f7128953ab05e6425fc'
        && definition.ini.getSection('Basic')?.getBool('IgnoreGlobalAITriggers')
        && ![...definition.scripts.values()].some(script => script.instructions.some(line => [17, 18].includes(line.opcode)))) {
        for (const id of ['0C258A1C', '0976F91C']) {
            if (!definition.scripts.has(id) || [...definition.teams.values()].some(team => team.script === id)) continue;
            result.scripts.add(id); result.records.push({ section: 'ScriptTypes', key: id,
                reason: 'No original team references this script; global AI is ignored and no script/team transition exists' });
        }
        return result;
    }
    if (!policy || policy.semanticsVersion < 12 || definition.edition !== 'ra2' || definition.filename !== 'sov10t.map'
        || policy.sourceSha256 !== '5c3d8b26e05a0a73530630db8353637fa9ed7072144d5360e1ab994869428449'
        || !definition.ini.getSection('Basic')?.getBool('IgnoreGlobalAITriggers')) return result;
    const actions = [...definition.triggers.values()].flatMap(trigger => trigger.actions);
    const localScripts = [...(definition.ini.getSection('ScriptTypes')?.entries.values() ?? [])].map(String);
    // A local script/team transition would invalidate this conservative proof.
    if (localScripts.some(id => definition.scripts.get(id)?.instructions.some(line => [17, 18].includes(line.opcode)))) return result;
    const dormantTeams = new Set<string>();
    for (const id of ['07F9D710', '07055D80']) {
        const team = definition.teams.get(id);
        if (!team || ['Autocreate', 'Prebuild', 'Reinforce'].some(key => ['yes', '1'].includes(team.properties[key]?.toLowerCase()))) continue;
        if (actions.some(action => action.params.includes(id))) continue;
        const incoming = [...definition.aiTriggers.values()].filter(trigger => trigger.team === id || trigger.secondTeam === id);
        if (incoming.some(trigger => trigger.enabled || actions.some(action => action.params.includes(trigger.id)))) continue;
        dormantTeams.add(id);
        result.records.push({ section: 'TeamTypes', key: id,
            reason: incoming.length ? 'Only incoming AI record is source-disabled with no original enabling action; no creation, prebuild or autocreate route'
                : 'No original action/AI/team-transition creation reference; prebuild/autocreate/reinforce flags are clear' });
    }
    if (dormantTeams.has('07F9D710')) result.diagnostics = definition.diagnostics.filter(issue => issue.section === '07F9D710'
        && ['Missing script or task force', 'Unknown team house'].includes(issue.reason));
    for (const id of ['07055B40', '07A6828C']) {
        if (!definition.scripts.has(id)) continue;
        const incoming = [...definition.teams.values()].filter(team => team.script === id);
        if (incoming.some(team => !dormantTeams.has(team.id))) continue;
        result.scripts.add(id); result.records.push({ section: 'ScriptTypes', key: id,
            reason: incoming.length ? 'Referenced only by a proven dormant original team' : 'No original or expanded-library team references this script' });
    }
    return result;
}
