import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { IniFile } from '../../../src/data/IniFile';
import { Rules } from '../../../src/game/rules/Rules';
import { Art } from '../../../src/game/art/Art';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
const root = '.artifacts/allied-units';
const ledger = JSON.parse(readFileSync(`${root}/coverage-ledger-v1.json`, 'utf8'));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const top = new Map(GAME_EDITIONS.yr.archives.map(n => [n, readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(n as any) ? 'ra2' : 'yr'}/${n}`)]));
const cells: any[] = [], decoded = new Set<string>(), mappings: any[] = [];
let frames = 0;
for (const edition of ['ra2','yr'] as const) {
  const source = `${root}/source-v2/${edition}`;
  const rules = new Rules(adaptRetailRules(new IniFile(readFileSync(`${source}/${GAME_EDITIONS[edition].rules}`, 'utf8'))).rules);
  const art = new Art(rules, new IniFile(readFileSync(`${source}/${GAME_EDITIONS[edition].art}`, 'utf8')), undefined, undefined);
  const tree = editionRetailTree(top, edition);
  for (const row of ledger.rows.filter((r: any) => r.edition === edition)) {
    const type = row.category === 'InfantryTypes' ? 3 : row.category === 'AircraftTypes' ? 1 : 7;
    const native = art.getObject(row.id, type);
    assert.equal(native.imageName.toLowerCase(), row.resolvedStem);
    mappings.push({edition, id:row.id, rulesImage:row.image, nativeImage:native.imageName,
      ignoredArtImage:row.art.Image ?? null, sequenceCount:native.sequences.size});
    for (const member of row.source) {
      assert.equal(sha(resolveMember(tree, member.member).file.getBytes()), member.sha256);
      if (!member.totalFrames || decoded.has(member.sha256)) continue;
      const file = JSON.parse(readFileSync(`${source}/${member.member}.json`, 'utf8'));
      assert.equal(file.frames.length, file.totalFrames);
      for (const frame of file.frames) {
        assert.equal(frame.pixels.length, frame.width * frame.height);
        assert.equal(sha(new Uint8Array(frame.pixels)), frame.sha256);
        assert(frame.x >= 0 && frame.y >= 0 && frame.x + frame.width <= file.canvas[0] && frame.y + frame.height <= file.canvas[1]);
      }
      decoded.add(member.sha256); frames += file.totalFrames;
    }
    for (const {theater} of row.theaters) {
      const suffix = {TEMPERATE:'tem',SNOW:'sno',URBAN:'urb',NEWURBAN:'ubn',DESERT:'des',LUNAR:'lun'}[theater];
      const member = `unit${suffix}.pal`;
      try {
        const palette = resolveMember(tree, member);
        cells.push({edition,theater,id:row.id,nativeImage:native.imageName,
          palette:{member,archive:palette.source,sha256:sha(palette.file.getBytes())},
          status: native.useTheaterExtension ? 'THEATER_EXTENSION_REQUIRES_REVIEW' : 'IDENTICAL_UNIT_MEMBERS_DISTINCT_NATIVE_PALETTE',
          alternateArctic: !!(rules.getObject(row.id,type) as any).alternateArcticArt});
      } catch(error) { cells.push({edition,theater,id:row.id,status:'PALETTE_UNRESOLVED',error:String(error)}); }
    }
  }
}
for (const pin of ledger.protectedFiles) assert.equal(sha(readFileSync(pin.path)),pin.sha256);
assert.equal(mappings.find(r=>r.edition==='yr' && r.id==='BFRT').nativeImage,'BFRT');
assert.equal(mappings.find(r=>r.id==='MTNK').nativeImage,'GTNK');
writeFileSync(`${root}/source-verification-v1.json`,JSON.stringify({status:'PASS_SOURCE_AND_NATIVE_IMAGE_CONTRACTS',
  uniqueDecodedShp:decoded.size,frames,mappings,cells,protectedIdentities:ledger.protectedFiles.length,
  disclosure:'Structural and native Art parsing only; no actual HD activation or theater gameplay claim.'},null,2)+'\n',{flag:'wx'});
console.log({uniqueDecodedShp:decoded.size,frames,cells:cells.length,unresolved:cells.filter(c=>c.status==='PALETTE_UNRESOLVED').length});
