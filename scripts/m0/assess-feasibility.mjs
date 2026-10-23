// Read-only staged-resource assessment. Run with Bun from the repository root.
// Raw map/editor strings stay in ignored evidence; docs contain metadata only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { retailTree, resolveMember } from '../../src/offline/retail.ts';
import { IniFile } from '../../src/data/IniFile.ts';
import { ShpFile } from '../../src/data/ShpFile.ts';
import { VxlFile } from '../../src/data/VxlFile.ts';
import { HvaFile } from '../../src/data/HvaFile.ts';
import { CsfFile } from '../../src/data/CsfFile.ts';
import { TriggerActionType } from '../../src/data/map/trigger/TriggerActionType.ts';
import { TriggerEventType } from '../../src/data/map/trigger/TriggerEventType.ts';

const out = '.artifacts/m0-4';
mkdirSync(out, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (name, data) => writeFileSync(`${out}/${name}`, JSON.stringify(data, null, 2) + '\n');
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'maps01.mix', 'maps02.mix'];
const top = new Map(names.map(name => [name, readFileSync(`.local/assets/ra2/${name}`)]));
const tree = retailTree(top);
const sourceIdentity = {
    baseline: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    archives: names.map(name => ({ name, bytes: top.get(name).length, sha256: sha(top.get(name)) })),
};
function member(name) {
    const selected = resolveMember(tree, name);
    return { name, source: selected.source, memberId: selected.memberId,
        bytes: selected.file.getSize(), sha256: sha(selected.file.getBytes()),
        occurrences: tree.filter(x => x.mix.containsFile(name)).map(x => ({
            source: x.path, sha256: sha(x.mix.openFile(name).getBytes()),
        })) };
}
const section = (ini, name) => ini.getSection(name)?.entries ?? new Map();
const object = (ini, name) => Object.fromEntries(section(ini, name));
function rawInstructions(ini, sectionName) {
    const rows = [];
    for (const [triggerId, raw] of section(ini, sectionName)) {
        const parts = String(raw).split(',');
        const count = Number(parts.shift());
        assert(Number.isInteger(count) && count >= 0, `${sectionName}/${triggerId}: count`);
        for (let index = 0; index < count; index++) {
            const id = Number(parts.shift());
            let params;
            if (sectionName === 'Actions') {
                assert(parts.length >= 7, `${sectionName}/${triggerId}: truncated`);
                params = parts.splice(0, 7);
            } else {
                const mode = Number(parts.shift());
                assert([0, 1, 2].includes(mode), `${sectionName}/${triggerId}: unknown arity ${mode}`);
                const n = mode === 2 ? 2 : 1;
                assert(parts.length >= n, `${sectionName}/${triggerId}: truncated`);
                params = [mode, ...parts.splice(0, n)];
            }
            assert(Number.isInteger(id), `${sectionName}/${triggerId}: id`);
            rows.push({ triggerId, index, id, params });
        }
        assert(parts.length === 0, `${sectionName}/${triggerId}: trailing tokens`);
    }
    return rows;
}
const factories = {};
for (const [kind, file, enumObj, prefix] of [
    ['action', 'TriggerExecutorFactory', TriggerActionType, 'TriggerActionType'],
    ['event', 'TriggerConditionFactory', TriggerEventType, 'TriggerEventType'],
]) {
    const path = `src/game/trigger/${file}.ts`;
    const text = readFileSync(path, 'utf8');
    const cases = [...text.matchAll(new RegExp(`case ${prefix}\\.(\\w+):\\s*return new (\\w+)`, 'g'))];
    factories[kind] = { path, sha256: sha(text), entries: cases.map(m => ({ id: enumObj[m[1]], name: m[1], handler: m[2] })) };
}
const prior = JSON.parse(readFileSync('docs/campaign-inventory.json', 'utf8'));
const maps = prior.campaigns.map(old => {
    const ini = new IniFile(resolveMember(tree, old.filename).file.readAsString());
    const actions = rawInstructions(ini, 'Actions');
    const events = rawInstructions(ini, 'Events');
    const scripts = [...section(ini, 'ScriptTypes').values()].map(id => ({ id,
        instructions: [...section(ini, String(id))].filter(([key]) => /^\d+$/.test(key)).map(([key, raw]) => {
            const [opcode, ...params] = String(raw).split(',');
            return { index: Number(key), opcode: Number(opcode), params };
        }),
    }));
    const ids = rows => [...new Set(rows.map(x => x.id))].sort((a, b) => a - b);
    const missing = (rows, kind) => ids(rows).filter(id => !factories[kind].entries.some(x => x.id === id));
    assert.deepEqual(ids(actions), old.actionIds);
    assert.deepEqual(ids(events), old.eventIds);
    assert.deepEqual(missing(actions, 'action'), old.missingActions);
    assert.deepEqual(missing(events, 'event'), old.missingEvents);
    const countedSections = [
        'Triggers', 'Events', 'Actions', 'Tags', 'TeamTypes', 'ScriptTypes', 'TaskForces',
        'Waypoints', 'Houses', 'VariableNames', 'Structures', 'Units', 'Infantry', 'Aircraft', 'CellTags',
    ];
    const counts = Object.fromEntries(countedSections.map(s => [s, section(ini, s).size]));
    const teams = [...section(ini, 'TeamTypes').values()].map(id => ({ id, properties: object(ini, String(id)) }));
    const taskForces = [...section(ini, 'TaskForces').values()].map(id => ({ id, properties: object(ini, String(id)) }));
    return { ...member(old.filename), counts, basic: object(ini, 'Basic'),
        houses: [...section(ini, 'Houses')].map(([index, name]) => ({ index, name, properties: object(ini, String(name)) })),
        triggers: object(ini, 'Triggers'), tags: object(ini, 'Tags'), actions, events, scripts, teams, taskForces,
        variableNames: object(ini, 'VariableNames'),
        missingActions: missing(actions, 'action'), missingEvents: missing(events, 'event'),
    };
});
const catalogs = [];
for (const name of ['battle.ini', 'mission.ini', 'missions.ini', 'missions.pkt', 'mapsel.ini']) {
    try {
        const meta = member(name);
        const text = resolveMember(tree, name).file.readAsString();
        writeFileSync(`${out}/${name}.txt`, text);
        catalogs.push(meta);
    } catch (error) {
        if (!String(error).includes('Required archive member missing')) throw error;
        catalogs.push({ name, absentInAllowlistedTree: true });
    }
}
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const rules = new IniFile(resolveMember(tree, 'rules.ini').file.readAsString());
const assets = [];
const assetNames = [
    'gi.shp', 'cons.shp', 'e1.shp', 'e2.shp', 'gtpowr.shp', 'gntpowr.shp', 'gapowr.shp',
    'gtpowrmk.shp', 'gtnpowr.shp', 'gtnpowrmk.shp', 'ggpowr.shp', 'ggpowr_a.shp', 'ggpowrmk.shp',
    'gspowr.shp', 'gupowr.shp', 'gtpowr_a.shp', 'gtpowr_ad.shp', 'gapowr_a.shp', 'gapowr_ad.shp',
    'htnk.vxl', 'htnktur.vxl', 'htnkbarl.vxl', 'htnk.hva', 'htnktur.hva', 'htnkbarl.hva',
];
for (const name of assetNames) {
    try {
        const meta = member(name);
        if (name.endsWith('.shp')) {
            const shp = new ShpFile(resolveMember(tree, name).file);
            meta.canvas = [shp.width, shp.height]; meta.frames = shp.numImages;
            meta.frameMetadata = shp.images.map((x, index) => ({ index, x: x.x, y: x.y, width: x.width, height: x.height }));
            meta.trimmedPixels = shp.images.reduce((sum, x) => sum + x.width * x.height, 0);
        }
        if (name.endsWith('.vxl')) {
            const vxl = new VxlFile(resolveMember(tree, name).file);
            meta.voxels = vxl.voxelCount;
            meta.sections = vxl.sections.map(s => ({ name: s.name, size: [s.sizeX, s.sizeY, s.sizeZ], normalsMode: s.normalsMode }));
        }
        if (name.endsWith('.hva')) {
            const hva = new HvaFile(resolveMember(tree, name).file);
            meta.sections = hva.sections.map(s => ({ name: s.name, matrixFrames: s.matrices.length }));
        }
        assets.push(meta);
    } catch (error) {
        if (!String(error).includes('Required archive member missing')) throw error;
        assets.push({ name, absentInAllowlistedTree: true });
    }
}
const csf = new CsfFile(resolveMember(tree, 'ra2.csf').file);
const textCoverage = maps.filter(x => /01t/.test(x.name)).map(map => {
    const labels = [...new Set(map.actions.filter(x => x.id === 11).map(x => x.params[1]))];
    return { name: map.name, labels: labels.map(label => ({ label, present: Object.hasOwn(csf.data, label) || Object.hasOwn(csf.data, label.toUpperCase()) })) };
});
write('inventory.json', { sourceIdentity, factories, maps, catalogs, assets,
    art: Object.fromEntries(['GI', 'CONS', 'GAPOWR', 'GAPOWR_A', 'GAPOWR_AD', 'HTNK', 'GISequence', 'ConSequence'].map(n => [n, object(art, n)])),
    rules: Object.fromEntries(['E1', 'E2', 'GAPOWR', 'HTNK'].map(n => [n, object(rules, n)])),
    locale: { source: member('ra2.csf'), locale: csf.getIsoLocale(), labels: csf.parsedLabels, duplicates: csf.duplicateLabels, textCoverage },
});
console.log(JSON.stringify({ maps: maps.length, supported: Object.fromEntries(Object.entries(factories).map(([k,v]) => [k,v.entries.length])),
    priorCoverageUnchanged: true, assets: assets.filter(x => !x.absentInAllowlistedTree).map(({ name, canvas, frames }) => ({ name, canvas, frames })), catalogs }, null, 2));
