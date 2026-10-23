// Stage the verified runtime without carrying test profiles or absolute registrations.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeLauncher } from './launcher.mjs';

assert(process.argv[3], 'Specify the verified review package explicitly');
const source=path.resolve(process.argv[3]);
const receipt=JSON.parse(await fs.readFile(path.join(source,'package-receipt.json'),'utf8'));
const catalogs=path.join(receipt.app,'Contents/Resources/app/desktop');
const buildings=JSON.parse(await fs.readFile(path.join(catalogs,'allied-building-coverage.json'),'utf8'));
const units=JSON.parse(await fs.readFile(path.join(catalogs,'allied-unit-contracts.json'),'utf8'));
const revision=entry=>entry.familyPath.split('/').at(-2);
const out=path.resolve(process.argv[2]);await fs.mkdir(out,{recursive:false});
const name='RA2-HD-Allied-Corrections-'+receipt.runtimeIdentity.head.slice(0,7)+'-macOS-arm64';
const folder=path.join(out,name);await fs.mkdir(folder);
const app=path.join(folder,'RA2 HD Allied Corrections.app');
execFileSync('/usr/bin/ditto',[receipt.app,app]);
const resources=path.join(folder,'RA2-HD-Editions-Resources');
await fs.cp(receipt.resources,resources,{recursive:true,force:false,errorOnExist:true,
    mode:constants.COPYFILE_FICLONE,verbatimSymlinks:true});
for(const row of receipt.inventory){
    const destination=path.join(resources,row.file);
    assert.equal(createHash('sha256').update(await fs.readFile(destination)).digest('hex'),row.sha256,row.file);
    assert.notEqual((await fs.stat(destination)).ino,(await fs.stat(path.join(receipt.resources,row.file))).ino);
}
await writeLauncher(folder);
if(process.argv[4])await fs.copyFile(path.resolve(process.argv[4]),path.join(folder,'Allied-Corrections-Review.html'),constants.COPYFILE_EXCL);
await fs.writeFile(path.join(folder,'README.txt'),`Allied animation and sidebar corrections - macOS Apple Silicon

1. Extract the ZIP and keep this whole folder together.
2. Double-click "Launch Allied Corrections.command". It registers this folder's
   bundled resources and stores settings/saves in Trainer-Review-Profile here.
   The app can also be opened directly on a fresh extraction.
3. Choose Red Alert 2 or Yuri's Revenge. Set Original / 2X / 4X before starting
   a match; world density is selected when the match initializes.

Test scope: GAAIRC/AMRADR radar attachment, ATESLA solid rotating/charging head,
sidebar category switching, and E1 GI deployed firing. Both density resources
are included. YR GGI/BFRT/GAROBO/ForceShield cameos retain intentional Original.

Runtime source: ${receipt.runtimeIdentity.head}.
Current feedback: fixed GI fortress and rigid Prism petal rotation.
Open Allied-Corrections-Review.html for offline synchronized comparisons.
Repair branch: fix/allied-animation-sidebar. READY_FOR_REVIEW / NOT_MERGED.
Task C's uncommitted work is excluded. This folder uses independent resources
and a new local profile; existing game installations/profiles are not changed.
`);
await fs.writeFile(path.join(folder,'BUILD-INFO.json'),JSON.stringify({
    runtimeCommit:receipt.runtimeIdentity.head,reviewCommit:receipt.runtimeIdentity.head,
    base:'ee35fcf04de2d24c1bce2ee7497e4156483b21f1',status:'READY_FOR_REVIEW',integration:'NOT_MERGED',
    resourceFiles:receipt.inventory.length,
    buildingRevisions:{hq:revision(buildings['gaairc-temperate']),prism:revision(buildings['atesla-temperate'])},
    giRevision:revision(units.shp.E1),
    selectedResourceFiles:receipt.inventory.filter(row=>/\/animation-r\d+\//.test(row.file)),
},null,2)+'\n');
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app]);
await fs.writeFile(path.join(out,'stage-receipt.json'),JSON.stringify({folder,app,resources,name,
    runtimeCommit:receipt.runtimeIdentity.head,resourceFiles:receipt.inventory.length},null,2)+'\n');
console.log(folder);
