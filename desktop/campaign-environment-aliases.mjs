import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import aliases from './campaign-environment-aliases.json' with { type: 'json' };
import snow from './environment-snow-hd-contract.json' with { type: 'json' };
import urban from './environment-urban-hd-contract.json' with { type: 'json' };
import temperate from './environment-hd-contract.json' with { type: 'json' };
import newurban from './environment-newurban-hd-contract.json' with { type: 'json' };
import desert from './environment-desert-hd-contract.json' with { type: 'json' };

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw Error(message); };

// Source-qualified context aliases reuse immutable registered pages. Each whole
// family validates before publication; no PNG is copied or replaced.
export async function registerCampaignEnvironmentAliases(profile, record = () => {}) {
    for (const alias of aliases.records) {
        try {
            const contract = { TEMPERATE: temperate, SNOW: snow, URBAN: urban, NEWURBAN: newurban, DESERT: desert }[alias.theater];
            check(contract, 'Unsupported campaign alias theater');
            const targetRoute = `/local-environment${alias.theater === 'TEMPERATE' ? '' : '/' + alias.theater.toLowerCase()}/selection.json`;
            const target = profile.selections.get(targetRoute);
            const sourceRoute = `/local-environment${alias.sourceTheater === 'TEMPERATE' ? '' : '/' + alias.sourceTheater.toLowerCase()}/selection.json`;
            const source = profile.selections.get(sourceRoute)?.families[alias.sourceFamily], declared = contract.families[alias.identity];
            const declarations = alias.members ?? [alias];
            const memberDonors = alias.sourcePolicy === 'complete-native-member-donors-v1';
            check(target && declared?.familyHash === alias.familyHash && declared.members.length === declarations.length
                && (memberDonors || source && source.members.length === declarations.length),
                'Campaign alias complete family identity');
            check(new Set(declarations.map(member => member.member)).size === declarations.length
                && declared.members.every(member => declarations.some(spec => spec.member === member)),
                'Campaign alias complete distinct member set');
            const members = [];
            for (const spec of declarations) {
                const donorTheater = memberDonors ? spec.sourceTheater : alias.sourceTheater;
                const donor = memberDonors ? profile.selections.get(`/local-environment${donorTheater === 'TEMPERATE'
                    ? '' : '/' + donorTheater?.toLowerCase()}/selection.json`)?.families[spec.sourceFamily] : source;
                check(donor && (!memberDonors || ['TEMPERATE', 'SNOW', 'URBAN', 'NEWURBAN', 'DESERT'].includes(donorTheater)
                    && typeof spec.sourceMember === 'string'), 'Campaign alias registered member donor');
                const member = memberDonors ? donor.members.find(member => member.member === spec.sourceMember)
                    : declarations.length === 1 ? donor.members[0] : donor.members.find(member => member.member === spec.member);
                check(member?.sha256 === spec.sourceManifestSha256, 'Campaign alias accepted manifest identity');
                check(spec.manifest || donorTheater === alias.theater, 'Cross-theater alias requires explicit native metadata');
                const destinationRoute = spec.manifest ?? member.manifest;
                const originalFile = profile.routes.get(member.manifest), destinationFile = profile.routes.get(destinationRoute);
                check(originalFile && destinationFile, 'Campaign alias registered metadata');
                const originalBytes = await fs.readFile(originalFile), destinationBytes = await fs.readFile(destinationFile);
                check(sha(originalBytes) === spec.sourceManifestSha256 && sha(destinationBytes) === spec.sha256,
                    'Campaign alias manifest integrity');
                const original = JSON.parse(originalBytes), destination = JSON.parse(destinationBytes);
                const native = declared.sourceOverrides?.[spec.member] ?? contract.sources[spec.member];
                check(destination.source?.theater === alias.theater && destination.source.member === spec.member
                    && destination.source.sha256 === native?.sha256 && native.sha256 === spec.sourceSha256,
                    'Campaign alias native source');
                check(JSON.stringify(destination.logical) === JSON.stringify(original.logical)
                    && JSON.stringify(destination.variants) === JSON.stringify(original.variants)
                    && destination.logical.frames.length === native.bodyFrames
                    && JSON.stringify(destination.variants.map(variant => variant.density).sort()) === '[2,4]',
                    'Campaign alias complete geometry and independent densities');
                for (const variant of destination.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
                    const file = profile.routes.get(member.files[page[role]]);
                    check(file, 'Campaign alias complete registered pages');
                    const bytes = await fs.readFile(file);
                    check(bytes.length === page[role + 'Bytes'] && sha(bytes) === page[role + 'Sha256'], 'Campaign alias page integrity');
                }
                members.push({ member: spec.member, sha256: spec.sha256, manifest: destinationRoute, files: { ...member.files } });
            }
            profile.selections.set(targetRoute, { ...target, families: { ...target.families,
                [alias.identity]: { familyHash: alias.familyHash, members } },
                campaignAliases: [...(target.campaignAliases ?? []), { identity: alias.identity, mode: alias.mode }] });
            record({ type: 'campaign-environment-alias-ready', identity: alias.identity, mode: alias.mode, copiedPages: 0 });
        } catch (error) { record({ type: 'campaign-environment-alias-original', identity: alias.identity, reason: error.message }); }
    }
}
