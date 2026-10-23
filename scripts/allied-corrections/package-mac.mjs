// One uniquely named offline Mac app with independently copied selected resources.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources, unitIdentities, sovietBatchRevisions } from '../../desktop/hd-profile.mjs';
import allied from '../../desktop/allied-building-coverage.json' with { type: 'json' };
import soviet from '../../desktop/soviet-building-coverage.json' with { type: 'json' };

import { writeLauncher } from './launcher.mjs';

const build = path.resolve(process.argv[2]), folder = path.resolve(process.argv[3]);
const source = path.resolve('.local');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(folder, { recursive: false });
const app = path.join(folder, 'RA2 HD Allied Corrections.app');
execFileSync('/usr/bin/ditto', ['node_modules/electron/dist/Electron.app', app]);
await fs.rename(path.join(app,'Contents/MacOS/Electron'),path.join(app,'Contents/MacOS/RA2 HD Editions'));
const payload = path.join(app,'Contents/Resources/app');await fs.mkdir(payload);
for(const name of ['dist','desktop','package.json'])await fs.cp(path.join(build,name),path.join(payload,name),{recursive:true,mode:constants.COPYFILE_FICLONE});
await fs.copyFile('LICENSE',path.join(payload,'LICENSE'));
await fs.copyFile('node_modules/electron/LICENSE',path.join(payload,'ELECTRON-LICENSE'));
const plist=path.join(app,'Contents/Info.plist');
for(const [key,value] of Object.entries({CFBundleIdentifier:'local.ra2hd.allied.corrections.r1',CFBundleName:'RA2 HD Allied Corrections',
    CFBundleDisplayName:'RA2 HD Allied Corrections',CFBundleExecutable:'RA2 HD Editions',CFBundleShortVersionString:'0.2.4',CFBundleVersion:'24'}))
    execFileSync('/usr/libexec/PlistBuddy',['-c',`Set :${key} ${value}`,plist]);
const profile=await validateProfile(source),hd=await registerHdResources(source);
const files=new Set([...profile.routes.values(),...hd.routes.values()].map(file=>path.relative(source,file)));
for(const file of ['ra2-core-manifest.json','yr-core-manifest.json','upstream-support/manifest.json','ui-selection.json',
    `ui-packs/${hd.selections.get('/local-ui/selection.json').revision}/manifest.json`])files.add(file);
for(const entry of [...Object.values(allied),...Object.values(soviet),...Object.values(unitIdentities)])files.add(entry.familyPath);
for(const [name,revision] of Object.entries(sovietBatchRevisions))files.add(`hd-packs/soviet-${name}-authored/${revision}/family.json`);
for(const name of ['power-plant','soviet-power-plant'])files.add(`hd-packs/${name}-authored/owner-r3/family.json`);
const resources=path.join(folder,'RA2-HD-Editions-Resources');await fs.mkdir(resources);
const inventory=[];
for(const file of [...files].sort()){
    assert(!path.isAbsolute(file)&&!file.startsWith('..'));
    const original=path.join(source,file),destination=path.join(resources,file);
    assert.equal(await fs.realpath(original),original);
    await fs.mkdir(path.dirname(destination),{recursive:true});
    await fs.copyFile(original,destination,constants.COPYFILE_EXCL|constants.COPYFILE_FICLONE);
    const sha256=digest(await fs.readFile(original));assert.equal(digest(await fs.readFile(destination)),sha256);
    assert.notEqual((await fs.stat(original)).ino,(await fs.stat(destination)).ino);
    inventory.push({file,sha256,bytes:(await fs.stat(destination)).size});
}
const copied=await registerHdResources(resources);assert.deepEqual([...copied.selections],[...hd.selections]);await validateProfile(resources);
const portable=path.join(folder,'Trainer-Review-Profile');await fs.mkdir(portable);
await fs.writeFile(path.join(portable,'resource-registration.json'),JSON.stringify({schemaVersion:1,directory:resources}));
await writeLauncher(folder);
execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',app]);
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app]);
const receipt={status:'ISOLATED_MAC_REVIEW_READY_NATIVE_VALIDATION_PENDING',app,resources,build,portableProfile:portable,inventory,
    runtimeIdentity:JSON.parse(await fs.readFile(path.join(build,'identity.json'),'utf8'))};
await fs.writeFile(path.join(folder,'package-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(app);
