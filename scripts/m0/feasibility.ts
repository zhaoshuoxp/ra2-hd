import { readFileSync, writeFileSync } from 'node:fs';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { TriggerReader } from '../../src/data/map/trigger/TriggerReader';
import { TriggerActionType } from '../../src/data/map/trigger/TriggerActionType';
import { TriggerEventType } from '../../src/data/map/trigger/TriggerEventType';
import { CsfFile } from '../../src/data/CsfFile';

const tree = retailTree(new Map(['ra2.mix','language.mix','multi.mix','maps01.mix','maps02.mix'].map(name => [name, readFileSync(`.local/assets/ra2/${name}`)])));
const actionSource = readFileSync('src/game/trigger/TriggerExecutorFactory.ts','utf8');
const eventSource = readFileSync('src/game/trigger/TriggerConditionFactory.ts','utf8');
const supportedActions = [...actionSource.matchAll(/case TriggerActionType\.(\w+)/g)].map(m => TriggerActionType[m[1] as keyof typeof TriggerActionType]);
const supportedEvents = [...eventSource.matchAll(/case TriggerEventType\.(\w+)/g)].map(m => TriggerEventType[m[1] as keyof typeof TriggerEventType]);
const campaigns = [];
for (const side of ['all','sov']) for (let i=1;i<=12;i++) for (const suffix of ['t','s','u']) {
    const filename = `${side}${String(i).padStart(2,'0')}${suffix}.map`;
    let member;
    try { member = resolveMember(tree,filename); } catch { continue; }
    const ini = new IniFile(member.file.readAsString());
    const reader = new TriggerReader();
    const events = (reader as any).readEvents(ini.getOrCreateSection('Events'));
    const actions = (reader as any).readActions(ini.getOrCreateSection('Actions'));
    const counts = Object.fromEntries(['Triggers','Events','Actions','Tags','TeamTypes','ScriptTypes','TaskForces','Waypoints'].map(name => [name,ini.getOrCreateSection(name).entries.size]));
    const actionIds = new Set<number>(actions.unknownActionTypes);
    for (const list of actions.actions.values()) for (const action of list) actionIds.add(action.type);
    const eventIds = new Set<number>(events.unknownEventTypes);
    for (const list of events.events.values()) for (const event of list) eventIds.add(event.type);
    const scriptOpcodes = new Set<number>();
    for (const value of ini.getOrCreateSection('ScriptTypes').entries.values()) {
        const section = ini.getSection(String(value));
        for (const [key, raw] of section?.entries ?? []) {
            if (/^\d+$/.test(key)) scriptOpcodes.add(Number(String(raw).split(',')[0]));
        }
    }
    campaigns.push({filename,source:member.source,memberId:member.memberId,bytes:member.file.getSize(),counts,
        actionIds:[...actionIds].sort((a,b)=>a-b),eventIds:[...eventIds].sort((a,b)=>a-b),
        missingActions:[...actionIds].filter(x=>!supportedActions.includes(x)).sort((a,b)=>a-b),
        missingEvents:[...eventIds].filter(x=>!supportedEvents.includes(x)).sort((a,b)=>a-b),
        scriptOpcodes:[...scriptOpcodes].sort((a,b)=>a-b),
        scriptExecution:'No retail ScriptTypes/TeamTypes/TaskForces execution pipeline found in pinned src/game or src/data'});
}
const csf = new CsfFile(resolveMember(tree,'ra2.csf').file);
const language = { locale:csf.getIsoLocale(),declaredLanguage:new DataView(resolveMember(tree,'ra2.csf').file.getBytes().buffer,resolveMember(tree,'ra2.csf').file.getBytes().byteOffset).getInt32(20,true),
    parsedLabels:csf.parsedLabels,duplicateLabels:csf.duplicateLabels,
    samples:Object.fromEntries([['THEME:INTRO',csf.data['THEME:INTRO']], ...Object.entries(csf.data).filter(([,value]) => /[\u4e00-\u9fff]/.test(value)).slice(0,3)]) };
writeFileSync('.artifacts/feasibility.json',JSON.stringify({language,campaigns,supportedActions,supportedEvents},null,2));
// Metadata only; never save retail strings or map payloads in docs.
writeFileSync('docs/campaign-inventory.json',JSON.stringify({schemaVersion:1,campaigns,supportedActions,supportedEvents},null,2)+'\n');
console.log(JSON.stringify({campaignCount:campaigns.length,firstMissions:campaigns.filter(x=>/01/.test(x.filename)),language:{...language,samples:undefined}},null,2));
