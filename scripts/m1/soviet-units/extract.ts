// Read only task-local retail copies. No importer, source mutations or gameplay patches.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../../src/offline/retail';
import { IniFile } from '../../../src/data/IniFile';
import { ShpFile } from '../../../src/data/ShpFile';
import { Palette } from '../../../src/data/Palette';
import { VxlFile } from '../../../src/data/VxlFile';
import { HvaFile } from '../../../src/data/HvaFile';
const out = process.argv[2] ?? '.artifacts/m1-7/source-v1';
if (existsSync(out)) throw Error('Use a fresh extraction directory');
mkdirSync(out, { recursive: true });
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const tree = retailTree(
  new Map(
    ['ra2.mix', 'language.mix', 'multi.mix'].map((n) => [
      n,
      readFileSync(`.local/assets/ra2/${n}`),
    ]),
  ),
);
const get = (n: string) => resolveMember(tree, n);
const identity = (n: string) => {
  const r = get(n);
  return { member: n, archive: r.source, sha256: hash(r.file.getBytes()) };
};
const rules = new IniFile(get('rules.ini').file.readAsString());
const art = new IniFile(get('art.ini').file.readAsString());
for (const n of ['rules.ini', 'art.ini']) writeFileSync(`${out}/${n}`, get(n).file.readAsString());
const plain = (s: any) => (s ? Object.fromEntries(s.entries) : null);
const countries = [...rules.getSection('Countries')!.entries.values()].map(String);
const soviets = countries.filter((n) => rules.getSection(n)?.getString('Side') === 'Nod');
const categories = ['InfantryTypes', 'VehicleTypes', 'AircraftTypes'];
const missingSections: any[] = [];
const catalogue = categories.flatMap((category) =>
  [...rules.getSection(category)!.entries.values()]
    .map(String)
    .filter((id) => {
      if (rules.getSection(id)) return true;
      missingSections.push({ category, id, reason: 'REGISTRY_ENTRY_WITHOUT_RULES_SECTION' });
      return false;
    })
    .map((id) => {
      const s = rules.getSection(id)!;
      const owners = s.getArray('Owner'),
        required = s.getArray('RequiredHouses'),
        forbidden = s.getArray('ForbiddenHouses');
      const houses = soviets.filter(
        (h) =>
          owners.includes(h) &&
          (!required.length || required.includes(h)) &&
          !forbidden.includes(h),
      );
      return {
        id,
        category,
        rules: plain(s),
        houses,
        techLevel: s.getNumber('TechLevel', -1),
        prerequisite: s.getArray('Prerequisite'),
      };
    }),
);
const selected = catalogue.filter((c) => c.houses.length && c.techLevel >= 0);
const expected =
  'E2 HTNK SENGINEER DOG FLAKT SHK IVAN YURI TERROR DESO CIVAN YURIPR HARV SMCV HTK DRON V3 APOC TTNK DTRUCK ZEP SAPC SUB HYD DRED SQD'.split(
    ' ',
  );
const discrepancy = {
  unexpected: selected.filter((c) => !expected.includes(c.id)).map((c) => c.id),
  missing: expected.filter((id) => !selected.some((c) => c.id === id)),
};
const palette = new Palette(get('unittem.pal').file).colors.map((c) => [c.r, c.g, c.b]);
const assets: Record<string, any> = {};
function asset(name: string, required = true) {
  if (assets[name]) return assets[name];
  try {
    const r = get(name),
      meta: any = identity(name);
    if (name.endsWith('.shp')) {
      const shp = new ShpFile(r.file);
      meta.canvas = [shp.width, shp.height];
      meta.totalFrames = shp.numImages;
      const frames = shp.images.map((f, frame) => ({
        frame,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        empty: !f.imageData.some(Boolean),
        sha256: hash(f.imageData),
        pixels: Array.from(f.imageData),
      }));
      writeFileSync(`${out}/${name}.json`, JSON.stringify({ ...meta, palette, frames }));
      meta.frames = frames.map(({ pixels, ...f }) => f);
    } else if (name.endsWith('.vxl')) {
      const v = new VxlFile(r.file);
      meta.sections = v.sections.map((s) => ({ name: s.name, ...s.toPlain() }));
      writeFileSync(`${out}/${name}.json`, JSON.stringify({ ...meta }));
      meta.sections = meta.sections.map(({ spans, ...s }: any) => s);
    } else if (name.endsWith('.hva')) {
      const h = new HvaFile(r.file);
      meta.sections = h.sections.map((s) => ({
        name: s.name,
        matrices: s.matrices.map((m) => m.toArray()),
      }));
    }
    assets[name] = meta;
    return meta;
  } catch (e) {
    if (required) throw e;
    return null;
  }
}
function representation(id: string) {
  const s = rules.getSection(id)!;
  const image = s.getString('Image') || id;
  const a = art.getSection(image)!;
  if (!a) throw Error(`Missing art ${id}/${image}`);
  const stem = (a.getString('Image') || image).toLowerCase();
  const voxel = a.getBool('Voxel');
  const members: any[] = [];
  if (voxel) {
    for (const suffix of [
      '',
      ...(s.getBool('NoSpawnAlt') ? ['wo'] : []),
      ...(s.getBool('Turret')
        ? Array.from(
            { length: Math.max(1, s.getNumber('TurretCount', 1)) },
            (_, i) => `tur${i || ''}`,
          ).concat('barl')
        : []),
    ]) {
      const v = asset(`${stem}${suffix}.vxl`, suffix === '' || suffix === 'wo');
      if (v) {
        members.push(v.member);
        const h = asset(`${stem}${suffix}.hva`, !a.getBool('NoHVA'));
        if (h) members.push(h.member);
      }
    }
  } else members.push(asset(`${stem}.shp`).member);
  return {
    id,
    image,
    stem,
    representation: voxel ? 'VXL/HVA' : 'SHP',
    rules: plain(s),
    art: plain(a),
    sequence: a.getString('Sequence') || null,
    sequences: plain(art.getSection(a.getString('Sequence'))),
    members,
  };
}
const families = selected.map((c) => {
  const root = representation(c.id);
  const s = rules.getSection(c.id)!;
  const children = ['UnloadingClass', 'Spawns'].flatMap((role) =>
    s.getString(role) ? [{ role, ...representation(s.getString(role)) }] : [],
  );
  const attachments =
    c.id === 'SQD'
      ? [
          {
            role: 'host-grapple',
            art: plain(art.getSection('SQDG')),
            member: asset('sqdg.shp').member,
            binding: 'Vehicle.updateSquidGrab creates SQDG on the host',
          },
        ]
      : [];
  const shared: any[] = [];
  for (const key of ['DeployingAnim', 'DeployedAnim', 'UndeployingAnim', 'WaterImage', 'Image']) {
    const name = root.art[key];
    if (name && key !== 'Image')
      shared.push({ field: key, name, classification: 'VERIFY_UNIT_SPECIFIC' });
  }
  const weapons = ['Primary', 'Secondary', 'ElitePrimary', 'EliteSecondary']
    .filter((k) => s.getString(k))
    .map((k) => {
      const name = s.getString(k),
        w = rules.getSection(name);
      const projectile = w?.getString('Projectile'),
        warhead = w?.getString('Warhead');
      return {
        slot: k,
        name,
        rules: plain(w),
        projectile: projectile
          ? {
              name: projectile,
              rules: plain(rules.getSection(projectile)),
              art: plain(art.getSection(rules.getSection(projectile)?.getString('Image') || projectile)),
            }
          : null,
        warhead: warhead ? { name: warhead, rules: plain(rules.getSection(warhead)) } : null,
      };
    });
  // Limbo-launched projectiles are the unit itself in flight, not a shared effect.
  for (const weapon of weapons) {
    const image = weapon.projectile?.rules?.Image;
    if (String(weapon.rules?.LimboLaunch).toLowerCase() !== 'yes' || !image || image.toLowerCase() === 'none') continue;
    const projectileArt = art.getSection(image);
    const member = `${(projectileArt?.getString('Image') || image).toLowerCase()}.shp`;
    if (!attachments.some(entry => entry.member === member)) attachments.push({
      role: 'limbo-launched-unit', art: plain(projectileArt), member: asset(member).member,
      binding: `${weapon.name}/${weapon.projectile.name} carries ${c.id} while the actor is in limbo`,
    });
  }
  return {
    ...c,
    ...root,
    children,
    attachments,
    weapons,
    unresolvedArtDependencies: shared,
    retainedOriginal: {
      cameo: root.art.Cameo,
      altCameo: root.art.AltCameo,
      explosion: s.getArray('Explosion'),
      damageParticles: s.getArray('DamageParticleSystems'),
      generic: [
        'native shadows',
        'muzzle flashes',
        'beams',
        'wakes',
        'parachutes',
        'shared special death effects',
        'sounds',
      ],
    },
    stolenTech: {
      allied: s.getBool('RequiresStolenAlliedTech'),
      soviet: s.getBool('RequiresStolenSovietTech'),
    },
    acceptedControl: ['E2', 'HTNK'].includes(c.id),
    activation: 'ORIGINAL',
    authoring: [],
    exports: [],
    tests: { source: 'PASS', runtime: 'NOT RUN', nativeGameplay: 'NOT RUN' },
    acceptance: 'NOT_REQUESTED',
    blockers: [],
  };
});
const graphMembers = new Set(families.flatMap((f) => f.children.map((c) => c.id)));
const excluded = catalogue
  .filter((c) => !selected.some((s) => s.id === c.id))
  .map((c) => ({
    ...c,
    reason: graphMembers.has(c.id)
      ? 'INCLUDED_PARENT_DEPENDENCY'
      : c.techLevel < 0
        ? 'DISABLED_OR_NONPRODUCTION'
        : !c.houses.length
          ? 'NO_NATIVE_SOVIET_HOUSE_ACCESS'
          : 'REQUIRES_REVIEW',
  }));
const inventory = {
  schema: 1,
  baseline: 'faab3b9f75b0eb627e600c5c18a4cc42e86567ea',
  inputs: ['rules.ini', 'art.ini', 'unittem.pal', 'unitsno.pal', 'uniturb.pal', 'voxels.vpl'].map(
    identity,
  ),
  sovietHouses: soviets,
  discrepancy,
  count: {
    rulesIdentities: families.length,
    newRulesIdentities: families.filter((f) => !f.acceptedControl).length,
    uniqueNewRootArt: new Set(families.filter((f) => !f.acceptedControl).map((f) => f.stem)).size,
  },
  families,
  excluded,
  missingSections,
  assets,
};
writeFileSync(`${out}/inventory.json`, JSON.stringify(inventory, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      soviets,
      discrepancy,
      count: inventory.count,
      families: families.map((f) => ({
        id: f.id,
        stem: f.stem,
        route: f.representation,
        children: f.children.map((c) => c.id),
        members: f.members,
        sequence: f.sequence,
        dependencies: f.unresolvedArtDependencies,
        stolenTech: f.stolenTech,
      })),
    },
    null,
    2,
  ),
);
