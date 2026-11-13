import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const read = async file => JSON.parse(await fs.readFile(file));
const pin = async file => ({ file, sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex') });
const prior = await read('docs/yr-campaign-material-feedback-20261108-r4.json');
const hostFile = '.artifacts/yr-campaign/feedback-20261109-host-suite-r2/summary.json';
const host = await read(hostFile);
assert.equal(host.acceptance,'HOST_TESTS_PASS_NATIVE_RUNTIME_NOT_RUN');
assert.equal(host.counts.failedCases+host.counts.loadErrors+host.counts.skipped+host.counts.processErrors,0);
assert.equal(host.omitted.length,0);
const names = ['pause-objectives-only-native-r1', 'ground-volume-native-2x-r2', 'ground-volume-native-4x-r2',
    'generic-volume-mtnk-native-4x-r1', 'generic-volume-ltnk-native-2x-r1',
    'castle-continuity-all87-native-2x-r2', 'castle-continuity-all87-native-4x-r2',
    'castle-continuity-combat-native-4x-r1'];
const native = [];
for (const name of names) {
    const file = `.artifacts/yr-campaign/${name}/report.json`, report = await read(file);
    assert(report.status.startsWith('PASS_'),name);
    native.push({ ...await pin(file), status:report.status });
}
const checkpoint = { schema:'yr-current-feedback-checkpoint-v1', date:'2026-11-09', revision:'r5',
    status:'TECHNICALLY_QUALIFIED_NATIVE_SOURCE_FROZEN_PACKAGE_PENDING', originalPlayableMaps:26, yrPlayableMaps:14,
    semanticsVersion:48, simulationChanged:false, plannedWorldArtMaterialWaits:[],
    scope:['Pause objectives without notification history','Coherent Soviet07 destruction animation',
        'Prior Lunar material restored and original voxel slope volume retained','Original CATIME01 fixed red verified'],
    acceptedOtherItems:await pin('docs/yr-campaign-feedback-acceptance-20261109.json'),
    originalRed:await pin('docs/yr-campaign-catime01-original-red-20261109.json'),
    lunar:await pin('docs/yr-campaign-lunar-rollback-20261109.json'),
    groundVolume:await pin('docs/yr-campaign-ground-volume-20261109.json'),
    collapse:await pin('docs/yr-campaign-castle-collapse-continuity-20261109.json'),
    host:{ ...await pin(hostFile), counts:host.counts, executions:host.files.length, omittedFiles:0 },
    typecheck:{ status:'PASS', log:'/private/tmp/ra2-feedback-20261109-typecheck-r3.log' }, native,
    storyHdLoading:prior.storyHdLoading, retainedOriginalQualifications:prior.retainedOriginalQualifications,
    inheritedR4:'docs/yr-campaign-material-delivery-20261108-r4.json',
    retainedMissionQualifications:'All fourteen source45 mission qualifications remain historical. This display/render revision has targeted native regressions; it does not repeat every mission or difficulty.',
    oldSaveQualification:'The legitimate post-nuclear Soviet07 checkpoint restores under its recorded policy and ordinary Kirov attacks reach the original victory with the revised collapse.',
    originalMapsAndAcceptedArt:'Frozen package preservation is verified independently before delivery. No source maps, accepted statue/bridge, snow, actor paint or construction paint are edited.',
    userVisualAcceptance:'PENDING_CURRENT_FOUR_ITEMS', windows:'NOT_RUN_ON_THIS_MAC', physical8And16GiB:'NOT_RUN_ON_THIS_MAC',
    realProfilesTouched:false, localMainOnly:true, remotePush:false };
await fs.writeFile('docs/yr-campaign-feedback-checkpoint-20261109-r5.json',JSON.stringify(checkpoint,null,2)+'\n');
console.log(JSON.stringify({ status:checkpoint.status, hostCases:host.counts.pass, native:native.length }));
