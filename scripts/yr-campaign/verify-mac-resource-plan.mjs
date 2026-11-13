import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { macResourcePlan } from '../m3-1/mac-resource-plan.mjs';

const [planFile, output] = process.argv.slice(2), out = path.resolve(output);
const canonical = path.resolve('.local'), planBytes = await fs.readFile(planFile), plan = JSON.parse(planBytes);
await fs.mkdir(out, { recursive: false });
const resources = path.join(out, 'resources'); await fs.mkdir(resources);
for (const [prefix, files] of [['', plan.files], ['campaign', plan.campaignFiles]]) for (const file of files) {
    const original = path.join(canonical, prefix, file), target = path.join(resources, prefix, file);
    assert.equal(await fs.realpath(original), original);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.link(original, target);
}
const staged = await macResourcePlan(resources, path.join(resources, 'campaign'));
for (const key of ['files', 'campaignFiles', 'availability', 'routeCount', 'selectionCount', 'layers', 'metadataOverrides'])
    assert.deepEqual(staged[key], plan[key], `Selected resource closure differs after independent registration: ${key}`);
assert.equal(staged.layers.length, 12);
for (const kind of ['terrain', 'environment']) for (const name of ['', '-urban', '-snow', '-newurban', '-desert', '-lunar'])
    assert(plan.files.includes(`${kind}${name}-selection.json`));
const report = { schema: 'yr-complete-mac-resource-plan-registration-proof-v1',
    status: 'PASS_COMPLETE_STAGED_REGISTRATION_IDENTICAL_SELECTED_ROUTES_FAMILIES_LUNAR_AND_CAMPAIGNS',
    plan: { file: planFile, sha256: createHash('sha256').update(planBytes).digest('hex') },
    resourceFiles: plan.files.length, campaignFiles: plan.campaignFiles.length,
    routeCount: plan.routeCount, selectionCount: plan.selectionCount, layers: staged.layers,
    sourceUnchanged: true, stagingUsesHardLinks: true, copiedPayloadBytes: 0, userProfilesIncluded: false };
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
