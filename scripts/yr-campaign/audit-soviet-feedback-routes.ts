import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { sha256 } from '../test-support/resources';

const out = path.resolve(process.argv[2]); mkdirSync(out, { recursive: true });
const reports = ['sov01umd', 'sov03umd', 'sov05umd', 'sov06lmd', 'sov07tmd'].map(stem => {
    const bytes = readFileSync(`.local/campaign/yr/${stem}/${stem}.map`);
    const d = new CampaignDefinition('yr', stem + '.map', bytes.toString());
    const triggers = [...d.triggers.values()], teams = [...d.teams.values()];
    const forceIds = [...d.taskForces.values()].filter(f => f.units.some(u => u.type === 'TANY')).map(f => f.id);
    const tanyaTeams = teams.filter(t => forceIds.includes(t.taskForce));
    const teamIds = tanyaTeams.map(t => t.id);
    return { mission: stem + '.map', sourceSha256: sha256(bytes),
        initialPlayerUnits: ['Units', 'Infantry'].flatMap(section => [...(d.ini.getSection(section)?.entries ?? [])]
            .map(([key, raw]) => ({ section, key, raw: String(raw) }))
            .filter(row => row.raw.startsWith('Russians,'))),
        tanyaTeams: tanyaTeams.map(t => ({ ...t, script: d.scripts.get(t.script), force: d.taskForces.get(t.taskForce) })),
        tanyaTriggers: triggers.filter(t => /tanya/i.test(t.name) || t.actions.some(a => a.params.some(p => teamIds.includes(p)))),
        victoryAndStatueTriggers: triggers.filter(t => /win|victor|statue|head|lost|defeat|castle|land dead|completed_objective/i.test(t.name)
            || t.actions.some(a => a.opcode === 1)),
        movieTriggers: triggers.filter(t => t.actions.some(a => [10, 100, 117].includes(a.opcode))),
        teams: stem === 'sov03umd' ? teams.map(t => ({ ...t, script: d.scripts.get(t.script), force: d.taskForces.get(t.taskForce) })) : undefined,
        variables: [...d.variables], waypoints: [...d.waypoints] };
});
writeFileSync(path.join(out, 'routes.json'), JSON.stringify(reports, null, 2) + '\n');
for (const r of reports) console.log(JSON.stringify({ mission: r.mission, tanya: r.tanyaTeams,
    tanyaTriggers: r.tanyaTriggers, victory: r.victoryAndStatueTriggers.filter(t => t.actions.some(a => a.opcode === 1)) }));
