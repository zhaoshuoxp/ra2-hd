import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ShpFile } from '../../src/data/ShpFile';
import { retailMember, sha256 } from '../test-support/resources';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';

const [sourceFile, qualificationFile, identity, output] = process.argv.slice(2);
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const original = read(sourceFile), source = original.sources.find((row: any) => row.identity === identity);
assert(source && source.format === 'shp');
const animation = source.bindingRole === 'ACTIVE';
assert(animation || source.bodyFrames === 4);
const acceptedSlots = Array.from({ length: animation ? source.bodyFrames : 3 }, (_, index) => index);
const qualification = read(qualificationFile);
const candidate = [...qualification.completeFrames, ...qualification.partialFrames].find((row: any) =>
    row.id === identity && row.theater === original.theater && row.members.some((member: any) => member.member === source.member));
assert(candidate);
const member = candidate.members.find((member: any) => member.member === source.member);
const frameDonors = member.frames.slice(0, acceptedSlots.length).map((frame: any) => frame.donor);
assert(frameDonors.every((donor: any, index: number) => donor && donor.sourceFrame === index
    && donor.manifest === frameDonors[0].manifest));
const donor = frameDonors[0];
const environment = await registerEnvironmentResources('.local'), campaign = await validateCampaignResources('.local/campaign');
const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
    selections: new Map([...environment.selections, ...campaign.selections]) };
await registerCampaignEnvironmentResources(profile); await registerCampaignEnvironmentAliases(profile);
const manifestFile = profile.routes.get(donor.manifest);
assert(manifestFile && sha256(fs.readFileSync(manifestFile)) === donor.sha256);
const target = new ShpFile(retailMember('yr', source.member, source.sha256).file);
const accepted = new ShpFile(retailMember('yr', donor.member, donor.native.sha256).file);
const slots = [];
const iso: Record<string, string> = { TEMPERATE: 'isotem.pal', SNOW: 'isosno.pal', URBAN: 'isourb.pal',
    NEWURBAN: 'isoubn.pal', DESERT: 'isodes.pal' };
for (let index = 0; index < source.bodyFrames; index++) {
    const a = target.images[index], b = accepted.images[index];
    const sameGeometry = JSON.stringify([target.width, target.height, a.x, a.y, a.width, a.height])
        === JSON.stringify([accepted.width, accepted.height, b.x, b.y, b.width, b.height]);
    const to = !animation && index === 3 ? { member: iso[original.theater], remapable: false } : source.palette;
    const from = donor.native.framePalettes?.[index] ?? donor.native.palette;
    const pa = retailMember('yr', to.member, to.sha256).file.getBytes();
    const pb = retailMember('yr', from.member, from.sha256).file.getBytes();
    let differingRenderedPixels = 0, differingOwnerPixels = 0, differingAlphaPixels = 0;
    let differingContactPixels = 0, differingNativeIndices = 0;
    if (sameGeometry) for (let pixel = 0; pixel < a.imageData.length; pixel++) {
        const u = a.imageData[pixel], v = b.imageData[pixel];
        differingNativeIndices += Number(u !== v); differingAlphaPixels += Number(!!u !== !!v);
        differingContactPixels += Number((u === 12) !== (v === 12));
        const ownerA = (to.remapable ?? source.remapable) && u >= 16 && u <= 31;
        const ownerB = (from.remapable ?? donor.native.remapable) && v >= 16 && v <= 31;
        differingOwnerPixels += Number(ownerA !== ownerB || ownerA && u !== v);
        if (u && v && [0, 1, 2].some(channel => pa[u * 3 + channel] !== pb[v * 3 + channel])) differingRenderedPixels++;
    }
    const eligible = sameGeometry && !differingNativeIndices && !differingRenderedPixels && !differingOwnerPixels
        && !differingAlphaPixels && !differingContactPixels;
    slots.push({ slot: index, status: eligible ? 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR' : 'INCOMPATIBLE_ORIGINAL_STATE',
        sameGeometry, nativeIndexSha256: sha256(a.imageData), paletteSha256: source.palette.sha256,
        differingRenderedPixels, differingOwnerPixels, differingAlphaPixels, differingContactPixels, differingNativeIndices });
}
assert(acceptedSlots.every(index => slots[index].status === 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR'));
const proof = { status: 'PASS_READ_ONLY_RENDERED_BODY_COMPARISON_NOT_FAMILY_COVERAGE',
    targetSourceJson: { file: path.resolve(sourceFile), sha256: sha256(fs.readFileSync(sourceFile)) },
    rows: [{ member: source.member, sourceSha256: source.sha256, donorMember: donor.member,
        donorSourceSha256: donor.native.sha256, targetBodyFrames: source.bodyFrames,
        donorBodyFrames: donor.native.bodyFrames, slots }] };
assert(!fs.existsSync(output)); fs.writeFileSync(output, JSON.stringify(proof, null, 2) + '\n');
// Match the existing Python admission format, including numbers stored as 53.0.
const colorHash = execFileSync('python3', ['-c',
    'import hashlib,json,sys; m=json.load(open(sys.argv[1])); print(hashlib.sha256(json.dumps(m["color"],sort_keys=True,separators=(",",":")).encode()).hexdigest())',
    manifestFile], { encoding: 'utf8' }).trim();
const declaration = { sourceSha256: source.sha256, donorMember: donor.member, manifestFile: path.resolve(manifestFile),
    manifestSha256: donor.sha256, proofFile: path.resolve(output), proofSha256: sha256(fs.readFileSync(output)), slots: acceptedSlots,
    ...(animation ? { completeOriginalAnimation: true } : {}),
    preserveAcceptedCoverage: { schema: animation ? 'preserve-pinned-accepted-animation-coverage-v1'
        : 'preserve-pinned-accepted-body-coverage-v1', slots: acceptedSlots,
        donorManifestSha256: donor.sha256,
            donorColorSha256: colorHash } };
fs.writeFileSync(output.replace(/\.json$/, '-declaration.json'), JSON.stringify(declaration, null, 2) + '\n');
console.log(JSON.stringify({ identity, target: source.member, donor: donor.member, unchangedAcceptedSlots: acceptedSlots, output }));
