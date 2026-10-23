import { readFileSync, writeFileSync } from 'node:fs';
import { IniFile } from '../../../src/data/IniFile';
import { Rules } from '../../../src/game/rules/Rules';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';
const root = '.artifacts/allied-units';
const ledger = JSON.parse(readFileSync(`${root}/coverage-ledger-v1.json`, 'utf8'));
const rows: any[] = [];
for (const edition of ['ra2','yr'] as const) {
  const ini = new IniFile(readFileSync(`${root}/source-v2/${edition}/${GAME_EDITIONS[edition].rules}`, 'utf8'));
  const rules = new Rules(adaptRetailRules(ini).rules);
  for (const row of ledger.rows.filter((r: any) => r.edition === edition)) {
    const type = row.category === 'InfantryTypes' ? 3 : row.category === 'AircraftTypes' ? 1 : 7;
    const rule: any = rules.getObject(row.id,type);
    const weaponSlots = Object.entries(row.rules).filter(([k]) => /^(Primary|Secondary|ElitePrimary|EliteSecondary|(Elite)?Weapon\d+)$/.test(k))
      .map(([slot,name]) => ({slot,name, rules: Object.fromEntries(ini.getSection(String(name))?.entries ?? [])}));
    rows.push({edition,id:row.id,weaponSlots,
      ifvLoadouts: row.id === 'FV' ? [...rule.turretIndexesByIfvMode].map(([mode,turret]) => ({mode,turret,
        weapon:row.rules[`Weapon${mode+1}`],eliteWeapon:row.rules[`EliteWeapon${mode+1}`],
        member:`fvtur${turret || ''}.vxl`, runtime:'PENDING_NATIVE_PASSENGER_ACTION'})) : [],
      requiredChildren:row.dependencies.children.map((c:any)=>({id:c.id,role:c.role,members:c.members})),
      requiredAttachments:row.dependencies.attachments,
      nativeShadowContract:row.source.filter((s:any)=>s.member.endsWith('.shp')).map((s:any)=>({member:s.member,
        totalSlots:s.totalFrames,visibleSlots:row.nativeContract.noShadow?s.totalFrames:s.totalFrames/2,
        shadowStart:row.nativeContract.noShadow?null:s.totalFrames/2,
        emptySlots:s.frames.filter((f:any)=>f.empty).map((f:any)=>f.frame),
        source:'ShadowRenderable.getFrameNo plus native NoShadow contract; indexed body shadow pixels remain native'})),
      requiredActions: {
        E1:['walk','deploy/undeploy','deployed fire'],GGI:['walk','deploy/undeploy','ground/air weapon'],
        GHOST:['swim','fire','C4'],TANY:['swim','fire','C4'],SPY:['disguise','infiltrate'],
        CLEG:['chrono transit','erase target'],JUMPJET:['flight','attack','altitude/shadow'],
        ENGINEER:['capture','repair'],CCOMAND:['chrono transit','fire','C4'],PTROOP:['mind control','psi blast'],
        CIVAN:['chrono transit','bomb placement'],SNIPE:['aim','fire'],ADOG:['move','limbo leap','return'],
        MTNK:['move','independent turret/barrel fire'],FV:['four native turret forms','repair','passenger evacuation'],
        MGTK:['disguise','reveal','fire'],CMIN:['mine','CMON unload','chrono transit'],
        AMCV:['move','deploy to accepted GACNST'],SREF:['aim','prism fire'],TNKD:['aim','fire'],
        ROBO:['power loss/recovery','move','fire'],BFRT:['transport','open-topped fire','evacuation'],
        ORCA:['takeoff','attack','dock/reload'],BEAG:['takeoff','attack','dock/reload'],
        SHAD:['flight','rotors','transport/unload'],CARRIER:['water movement','HORNET launch/attack/return'],
        DEST:['water movement','ASW launch/return','no-spawn alternate'],AEGIS:['water movement','anti-air fire'],
        LCRF:['water/shore movement','transport/unload'],DLPH:['swim','sonic attack','concealment/removal'],
      }[row.id] ?? ['movement','weapon','removal'],
      sharedNative:['generic projectiles/effects/sounds/wakes/parachutes','native shadows'],
      status:'INVENTORIED_NOT_HD_RUNTIME_VERIFIED'});
  }
}
writeFileSync(`${root}/dependencies-v1.json`,JSON.stringify({rows,
  sharedStartingForceTransport:'General.ParadropPlane remains shared native PDPLANE; Allied paradrop passenger E1 is in B.',
  arcticLimit:'Current ObjectArt appends A for AlternateArcticArt without a theater condition. GHOST resolves SEALA in the audited native implementation; no rule or engine correction is made here.'},null,2)+'\n',{flag:'wx'});
console.log('Dependency rows', rows.length, 'IFV distinct native turrets', new Set(rows.find(r=>r.edition==='yr'&&r.id==='FV').ifvLoadouts.map((l:any)=>l.member)).size);
