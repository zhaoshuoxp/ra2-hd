// Source-backed UI inventory. Retail pixels and identities stay in ignored output.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
const output = process.env.UI_OUTPUT ?? '.artifacts/menu-ui/inventory-v1';
mkdirSync(output, { recursive: true });
const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(n => [n, readFileSync(`.local/assets/ra2/${n}`)])));
const rules = new IniFile(resolveMember(tree, 'rules.ini').file.readAsString());
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const identity = (name: string) => {
    try { const r = resolveMember(tree, name); return { member: name, archive: r.source, sha256: hash(r.file.getBytes()), bytes: r.file.getSize() }; }
    catch { return { member: name, status: 'MISSING' }; }
};
const roster: any[] = [];
for (const kind of ['BuildingTypes', 'InfantryTypes', 'VehicleTypes', 'AircraftTypes']) {
    for (const raw of rules.getSection(kind)!.entries.values()) {
        const id = String(raw), r = rules.getSection(id); if (!r) continue;
        const image = r.getString('Image', id), a = art.getSection(image);
        const cameo = a?.getString('Cameo', 'xxicon').toLowerCase() ?? 'xxicon';
        const alternate = a?.getString('AltCameo', cameo).toLowerCase() ?? cameo;
        const techLevel = r.getNumber('TechLevel', -1), owners = r.getArray('Owner');
        const candidate = techLevel >= 0 && owners.length > 0;
        roster.push({ id, kind, image, uiName: r.getString('UIName'), techLevel, owners,
            requiredHouses: r.getArray('RequiredHouses'), forbiddenHouses: r.getArray('ForbiddenHouses'),
            prerequisites: r.getArray('Prerequisite'), buildLimit: r.getNumber('BuildLimit'),
            cameo: `${cameo}.shp`, alternate: `${alternate}.shp`,
            inclusion: candidate ? 'BUILD_MENU_CANDIDATE' : 'NON_BUILDABLE_RETAINED_FOR_AUDIT',
            acceptance: candidate ? 'NOT_AUTHORED' : 'ORIGINAL_RETAINED' });
    }
}
const superweapons = [...rules.getSection('SuperWeaponTypes')!.entries.values()].map(raw => {
    const id = String(raw), r = rules.getSection(id)!;
    return { id, cameo: `${r.getString('SidebarImage', 'xxicon').toLowerCase()}.shp`, acceptance: 'NOT_AUTHORED' };
});
const names = new Set([...roster.flatMap(r => [r.cameo, r.alternate]), ...superweapons.map(r => r.cameo)]);
const palette = new Palette(resolveMember(tree, 'cameo.pal').file);
const cameos = [...names].sort().map(name => {
    const source = identity(name);
    if ('status' in source) return source;
    const shp = new ShpFile(resolveMember(tree, name).file), f = shp.getImage(0);
    writeFileSync(`${output}/${name}.json`, JSON.stringify({ width: shp.width, height: shp.height,
        frame: { x: f.x, y: f.y, width: f.width, height: f.height, pixels: Array.from(f.imageData) },
        palette: palette.colors.map(c => [c.r, c.g, c.b]) }));
    return { ...source, nativeSize: [shp.width, shp.height], frames: shp.numImages,
        usage: roster.filter(r => [r.cameo, r.alternate].includes(name)).map(r => r.id),
        classification: 'raster art', color: 'cameo.pal baked RGB; no owner remap',
        states: 'normal, disabled light multiplier, selected outline; live production clock/queue/status above art',
        hdRoute: 'optional immutable UI pack / per-cameo RGBA asset', fallback: 'original native image', acceptance: 'NOT_AUTHORED' };
});
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]); }
const references = new Map<string, Set<string>>();
for (const file of files('src').filter(f => /\.(tsx?|css)$/.test(f))) {
    const text = readFileSync(file, 'utf8');
    if (!/gui|Gui|gameRes|ResourceLoader/.test(file)) continue;
    for (const match of text.matchAll(/["'`]([a-z0-9_-]+\.(?:shp|pcx|png|pal|webm|mp4))["'`]/gi)) {
        const name = match[1].toLowerCase();
        if (!references.has(name)) references.set(name, new Set());
        references.get(name)!.add(file);
    }
}
for (const name of ['ls800ustates','ls800france','ls800germany','ls800ukingdom','ls800russia','ls800cuba','ls800libya','ls800iraq','ls800korea','ls800obs']) references.set(`${name}.shp`, new Set(['src/gui/screen/game/loadingScreen/LoadingScreenWrapper.tsx']));
const ui = [...references].map(([name, refs]) => {
    const source = identity(name); const variants: any[] = [];
    if (name.endsWith('.shp')) for (const container of tree.filter(c => c.mix.containsFile(name))) {
        const file = container.mix.openFile(name); const s = new ShpFile(file);
        variants.push({ archive: container.path, sha256: hash(file.getBytes()), nativeSize: [s.width, s.height], frames: s.numImages });
    }
    return { ...source, references: [...refs], variants,
        classification: name.endsWith('.pal') ? 'palette dependency' : variants.some(v => v.frames > 1) ? 'animated raster' : 'raster art',
        acceptance: /mouse|target/.test(name) ? 'PRESERVATION_BASELINE' : 'INVENTORIED_NOT_AUTHORED' };
});
const result = { schemaVersion: 1, sources: ['rules.ini','art.ini','cameo.pal'].map(identity), roster, superweapons, cameos, ui,
    expansion: { status: 'DORMANT_UNVERIFIED', reason: 'Vanilla importer excludes expansion archives; no verified Yuri faction display route. Vanilla YURI/YURIP are inventoried separately; no Yuri gameplay unlocked.', entries: [] },
    caveat: 'Build-menu candidates preserve owner/prerequisite/house/tech metadata; runtime availability also depends on map, game mode and captured factories. Do not infer every candidate is immediately buildable.' };
writeFileSync(`${output}/inventory.json`, JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify({ roster: roster.length, candidates: roster.filter(r=>r.inclusion==='BUILD_MENU_CANDIDATE').length, cameos: cameos.length, ui: ui.length, missing: cameos.filter(c=>'status' in c) }));
