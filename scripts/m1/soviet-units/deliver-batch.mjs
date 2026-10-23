// Produce a new local delivery without overwriting reviews, apps or resource revisions.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { sovietUnitIdentities, vxlUnitIdentities } from '../../../desktop/hd-profile.mjs';

const root = process.cwd(),
    evidence = path.join(root, '.artifacts/m1-7');
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const write = async (p, v) => fs.writeFile(p, JSON.stringify(v, null, 2) + '\n');
const config = await read('scripts/m1/soviet-units/delivery-config.json');
const artifact = await read(process.argv[2]);
const mixedDir = process.argv[3],
    mixed = await read(path.join(mixedDir, 'result.json'));
assert(mixed.status.startsWith('PASS'));
const out = path.resolve(process.argv[4]);
assert(out.startsWith(evidence + path.sep));
await fs.mkdir(out, { recursive: false });
const ledger = await read(path.join(evidence, 'ledger.json'));
await write(path.join(out, 'prior-ledger.json'), ledger);
const acceptance = await read(path.join(evidence, 'representative-acceptance-v3.json'));
const baseline = await read(path.join(evidence, 'baseline-resources.json'));
const preservation = {
    status: 'PASS',
    baselineFiles: baseline.length,
    approvedRepresentatives: 24,
    buildingResources: 0,
    mismatches: [],
};
async function verify(file, expected) {
    assert.equal(hash(await fs.readFile(file)), expected, file);
}
for (const row of baseline)
    for (const checkout of [root, '/Users/Aone/RA2remaster/ra2-hd'])
        await verify(path.join(checkout, row.file), row.sha256);
await verify(path.join(evidence, acceptance.review), acceptance.reviewSha256);
for (const [id, art] of Object.entries(acceptance.artwork)) {
    await verify(ledger.families[id].artwork.selectedRaw, art.rawSha256);
    for (const sample of art.samples)
        for (const f of Object.values(sample.files)) await verify(f.path, f.sha256);
}
for (const row of (await read(path.join(evidence, 'building-resource-integration-v1.json')))
    .copied) {
    await verify(path.join(root, row.path), row.sha256);
    preservation.buildingResources++;
}
await write(path.join(out, 'preservation.json'), preservation);
const files = new Map(),
    rows = [];
async function includeDirectory(relative) {
    for (const entry of await fs.readdir(path.join(root, '.local', relative), {
        withFileTypes: true,
    })) {
        const name = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) await includeDirectory(name);
        else {
            assert(entry.isFile());
            const data = await fs.readFile(path.join(root, '.local', name));
            files.set(name, { path: name, bytes: data.length, sha256: hash(data) });
        }
    }
}
for (const [id, run] of Object.entries(config.nativeRuns)) {
    const f = ledger.families[id],
        blocked = id === 'YURIPR',
        original = id === 'SQD',
        correctionPending = config.reviewDecisions.correctionPending.includes(id),
        nativePath = path.join(evidence, 'runtime-' + run, 'result.json');
    const native = await read(nativePath);
    if (!blocked) assert(native.status.startsWith('PASS'), id);
    const entry = vxlUnitIdentities[id] ?? sovietUnitIdentities[id];
    const relative = entry.path ?? entry.familyPath;
    await verify(path.join(root, '.local', relative), entry.hash);
    const manifest = await read(path.join(root, '.local', relative));
    await includeDirectory(path.posix.dirname(relative));
    if (manifest.members)
        for (const m of manifest.members)
            await includeDirectory(`hd-packs/${m.packId}/${m.revision}`);
    const sweepRun = config.sweeps[id] ?? run,
        sweepPath = path.join(evidence, 'runtime-' + sweepRun, 'result.json');
    const sweep = await read(sweepPath);
    assert(sweep.status.startsWith('PASS'), id + ' sweep');
    const sweepEvidence = path.relative(root, sweepPath),
        nativeEvidence = path.relative(root, nativePath);
    const required = Object.fromEntries(
        Object.keys(f.requiredStates).map((state) => [
            state,
            { status: 'PASS_NATIVE', evidence: nativeEvidence },
        ]),
    );
    if (id === 'SENGINEER')
        required['captured-owner remap'] = {
            status: 'PASS_PAUSED_TWO_OWNER_PALETTE_SWEEP',
            evidence: sweepEvidence,
            note: 'Palette behavior is measured; no natural mind-control capture of this engineer is claimed.',
        };
    if (['DOG', 'DRON'].includes(id))
        required['limbo projectile / 32 native bearings'] = {
            status: 'PASS_NATIVE_ACTION_AND_CONTROLLED_SWEEP',
            evidence: [nativeEvidence, sweepEvidence],
        };
    if (blocked) {
        required['deploy psi'] = {
            status: 'UPSTREAM_GAMEPLAY_BLOCKED',
            evidence: [
                '.artifacts/m1-7/runtime-yuripr-original-psi-v1/result.json',
                nativeEvidence,
            ],
        };
        required['death/release'] = { status: 'INCOMPLETE', evidence: nativeEvidence };
    }
    if (['SUB', 'HYD'].includes(id))
        required.sinking = {
            status: 'NATIVE_EXPLOSION_REMOVAL_NO_SLOW_SINK',
            evidence: nativeEvidence,
        };
    if (id === 'SAPC')
        required['bridge restrictions'] = {
            status: mixed.bridgeCommand.outcome,
            evidence: path.relative(root, path.join(mixedDir, 'result.json')),
            note: 'No bridge-deck entry; does not assert arrival under the requested tile.',
        };
    if (id === 'DRED')
        required.sinking = {
            status: 'PASS_NATIVE_SINK_TRANSFORM_AND_REMOVAL',
            evidence: path.relative(root, path.join(mixedDir, 'result.json')),
        };
    if (original)
        for (const state of Object.keys(required))
            required[state] = { status: 'PASS_NATIVE_ORIGINAL', evidence: nativeEvidence };
    if (id === 'DESO')
        required['green radiation canisters'] = {
            status: 'PASS_COMPLETE_322_SLOT_CORRECTION',
            evidence: '.artifacts/m1-7/deso-fire-scale-v1/status.json',
        };
    const row = {
        id,
        name: f.rules.Name,
        group: f.group,
        representation: f.representation,
        status: blocked
            ? 'UPSTREAM_GAMEPLAY_BLOCKED'
            : original
              ? 'USER_REQUESTED_ORIGINAL'
              : 'COMPLETE_TEMPERATE_TECHNICAL_FAMILY',
        visualAcceptance: original
            ? 'ORIGINAL_ACCEPTED'
            : correctionPending
              ? 'CORRECTION_REVIEW_PENDING'
              : blocked
                ? 'ART_ACCEPTED_RUNTIME_BLOCKED'
                : 'ACCEPTED',
        representative: 'ACCEPTED',
        activation: blocked || original ? 'ORIGINAL_GUARDED' : 'HD_ON_DEMAND_TEMPERATE',
        manifest: '.local/' + relative,
        manifestSha256: entry.hash,
        members: manifest.members?.map((m) => m.member) ?? [
            ...new Set(manifest.parts.map((p) => p.member)),
        ],
        authoredPositions: manifest.parts
            ? manifest.parts.reduce((n, p) => n + p.frames.length, 0)
            : manifest.members.reduce((n, m) => n + m.frames, 0),
        effectiveDensity: mixed.memory.families[id].density,
        gpuBytes: mixed.memory.families[id].gpuBytes,
        sourceBinding: f.bindingContract,
        requiredStates: required,
        actions: config.nativeActions[id],
        limitations: config.limitations[id] ?? '',
        nativeEvidence,
        sweepEvidence,
        nativeStatus: native.status,
        sweepStatus: sweep.status,
        retainedOriginal: f.retainedOriginal,
        sourceDependencies: f.children,
        attachments: f.attachments,
    };
    rows.push(row);
    f.status = row.status;
    f.upstreamGameplay = blocked ? 'UPSTREAM_GAMEPLAY_BLOCKED' : row.nativeStatus;
    f.candidateNotesScope =
        'Historical representative-review notes; full production status is above.';
    f.memory = {
        ...f.memory,
        estimateOnly: false,
        atlasAndGpuUpload: 'MEASURED',
        voxelComponentAtlas: manifest.parts ? 'COMPLETE_REGISTERED_EIGHT_BEARING_COMPONENTS' : null,
        currentRuntimeGpuBytes: row.gpuBytes,
        currentEffectiveDensity: row.effectiveDensity,
        allocationEvidence: path.relative(root, path.join(mixedDir, 'result.json')),
    };
    f.exports = [
        ...(f.exports ?? []).filter((x) => x.scope !== 'CURRENT_FULL_FAMILY'),
        { scope: 'CURRENT_FULL_FAMILY', manifest: row.manifest, sha256: entry.hash },
    ];

    f.tests = {
        ...f.tests,
        nativeGameplay: blocked ? 'UPSTREAM_GAMEPLAY_BLOCKED' : 'PASS',
        runtime: blocked ? 'PASS_GUARDED_ORIGINAL' : 'PASS',
    };
    f.requiredStates = required;
    f.activation = row.activation;
    f.complete = row.visualAcceptance === 'ACCEPTED';
    f.production = {
        ...f.production,
        technicalSlotCompleteness: true,
        technicalFamilyCompleteness: !blocked && !original,
        runtimeValidation: row.nativeStatus,
        finalAcceptance: row.visualAcceptance,
        manifest: row.manifest,
        manifestSha256: entry.hash,
        combinedEffectiveDensity: row.effectiveDensity,
        pooledGpuBytes: row.gpuBytes,
    };
    f.testEvidence = {
        ...f.testEvidence,
        nativeHdGameplay: nativeEvidence,
        completeSweep: sweepEvidence,
        mixedStates: path.relative(root, path.join(mixedDir, 'result.json')),
        bridgeAssessment: path.relative(root, path.join(mixedDir, 'bridge-assessment.json')),
    };
    f.blockers = blocked ? [row.limitations] : [];
    f.visualAcceptance = row.visualAcceptance;
}
const coverage = {
    schema: 'm1-7-consolidated-coverage-v3',
    status: 'PARTIAL_BATCH_DELIVERED',
    representativeAcceptance: '24_OF_24_ACCEPTED',
    newFamilies: 24,
    technicalTemperateFamilies: 22,
    acceptedHdFamilies: 17,
    correctionReviewPending: config.reviewDecisions.correctionPending,
    originalRequested: ['SQD'],
    artCorrectionBlocked: [],
    blocked: ['YURIPR'],
    preserved: ['E2', 'HTNK'],
    finalAcceptance: 'ACCEPTED_EXCEPT_NAMED_CORRECTIONS_AND_BLOCKERS',
    worktree: root,
    branch: 'm1-7-soviet-units',
    buildingCheckpoint: 'ee371e0f42b77fd943bf5cd7c1ef6fa8fd2b7cc6',
    app: artifact.artifact,
    source: artifact.source.head,
    sourceDigest: artifact.source.sourceDigest,
    memory: {
        unitBytes: mixed.memory.gpuBytes,
        acceptedBaselineBytes: 268435456 - mixed.memory.budget,
        combinedBytes: 268435456 - mixed.memory.budget + mixed.memory.gpuBytes,
        capBytes: 268435456,
        remainingBytes: mixed.memory.budget - mixed.memory.gpuBytes,
    },
    commonValidation: {
        mixedStates: path.relative(root, path.join(mixedDir, 'result.json')),
        bridgeAssessment: path.relative(root, path.join(mixedDir, 'bridge-assessment.json')),
        nativeOutput: [1491, 1080],
        referenceHeight: 900,
        cameraZoom: 1,
        typecheck: '.artifacts/m1-7/typecheck-fire-scale-final.log',
        regression: '.artifacts/m1-7/regression-fire-scale-final.log',
    },
    limits: [
        'Other reviewed units are accepted. DESO/HARV/HYD/DRED/SUB corrections need review; SQD is user-selected Original. YURIPR remains upstream blocked.',
        'Runtime activation is temperate only. Snow and urban retain Original and are not certified as HD.',
        'Windows, physical panel output, long-battle performance, campaign, online and iCloud transfer are unverified.',
        'Generic effects, shadows, wakes, sounds and cameos retain native resources. Native shadow opacity follows cloak/warp.',
        'Native action scenarios use disclosed prerequisite/target placements; full frame/bearing sweeps and special-state fixtures are controlled tests.',
        'Shared SHP geometry/shadow/opacity and accepted Conscript occlusion archetype tests are reused; not every infantry was separately marched through every terrain or transport context.',
    ],
    families: rows,
};
await write(path.join(out, 'coverage.json'), coverage);
const resourceRoot = path.join(out, 'Unit Resources v3');
await fs.mkdir(resourceRoot);
for (const row of files.values()) {
    const target = path.join(resourceRoot, row.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(root, '.local', row.path), target);
    await verify(target, row.sha256);
}
await write(path.join(resourceRoot, 'resource-index.json'), {
    schema: 'm1-7-unit-resources-v3',
    activation:
        '22 temperate candidates; SQD user-selected Original; YURIPR upstream blocked; DESO green-canister member revision 4 with stable upper-right firing size',
    families: rows.map((r) => ({
        id: r.id,
        manifest: r.manifest,
        sha256: r.manifestSha256,
        activation: r.activation,
    })),
    files: [...files.values()],
});
await fs.writeFile(
    path.join(resourceRoot, 'README.md'),
    "# Soviet unit resources v3\n\nLocal review resources only. Preserve each hd-packs/<id>/<revision> path. This bundle contains all 24 candidate families and their unit-specific dependencies; YURIPR and SQD are disabled at runtime. DESO complete green-canister artwork is active. It excludes retail archives, accepted Conscript/Rhino and building packs. The review app uses the existing isolated checkout .local directory, which already includes the compatible accepted baseline. Do not replace or modify another task's resources.\n",
);
execFileSync('/usr/bin/ditto', [
    '-c',
    '-k',
    '--keepParent',
    resourceRoot,
    path.join(out, 'Soviet-Unit-Resources-v3.zip'),
]);

// Embed native-size pairs and videos. Video bytes are decoded only on demand.
const esc = (s) =>
    String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('"', '&quot;');
const uri = async (file, mime = 'image/png') =>
    'data:' + mime + ';base64,' + (await fs.readFile(file)).toString('base64');
const media = {},
    cards = [];
for (const row of rows) {
    const runtime = path.join(evidence, 'runtime-' + config.nativeRuns[row.id]);
    const sweep = path.join(
        evidence,
        'runtime-' + (config.sweeps[row.id] ?? config.nativeRuns[row.id]),
    );
    const names = (await fs.readdir(sweep)).sort(),
        pairs = [];
    for (const owner of [0, 1]) {
        const name = names.find(
            (n) => n.startsWith('owner-' + owner + '-') && n.endsWith('-original.png'),
        );
        assert(name, row.id + ' paired native image');
        pairs.push(
            `<figure><figcaption>Owner ${owner + 1}: ${row.id === 'SQD' ? 'Historical inactive candidate: ' : ''}Original / HD, matched tick and pose</figcaption><div class="pair"><img alt="${row.id} Original owner ${owner}" src="${await uri(path.join(sweep, name))}"><img alt="${row.id} HD owner ${owner}" src="${await uri(path.join(sweep, name.replace('-original.png', '-hd.png')))}"></div></figure>`,
        );
    }
    const reference = acceptance.artwork[row.id].samples[0].files.candidate.path;
    const statusLabel = {
        ACCEPTED: 'Accepted',
        ORIGINAL_ACCEPTED: 'Accepted Original fallback',
        CORRECTION_REVIEW_PENDING: 'Corrected · visual review pending',
        ART_ACCEPTED_RUNTIME_BLOCKED: 'Artwork accepted · upstream gameplay blocked',
    }[row.visualAcceptance];
    const video = path.join(runtime, 'native-actions.webm');
    try {
        media[row.id] = (await fs.readFile(video)).toString('base64');
    } catch (e) {
        throw Error('Missing native recording: ' + row.id);
    }
    const special = [];
    for (const label of ['warp', 'iron-curtain', 'ramp-1', 'bridge-on', 'bridge-under']) {
        const name = `${row.id}-${label}-hd.png`;
        try {
            special.push(
                `<figure><figcaption>${esc(label)}: Original / HD</figcaption><div class="pair"><img alt="${esc(label)} Original" src="${await uri(path.join(mixedDir, name.replace('-hd.png', '-original.png')))}"><img alt="${esc(label)} HD" src="${await uri(path.join(mixedDir, name))}"></div></figure>`,
            );
        } catch {}
    }
    if (row.id === 'DESO')
        special.push(
            `<figure><figcaption>Complete green-canister correction: all 322 native slots, active in this app.</figcaption><img alt="DESO corrected rear preview" src="${await uri(path.join(evidence, 'production-deso-review-v17/000-candidate.png'))}"></figure><p><a href="DESO-Green-Canisters-Complete-Review.html">Open the embedded complete artwork review</a></p>`,
        );
    cards.push(
        `<article data-group="${esc(row.group)}" id="${row.id}"><h2>${row.id} <span>${esc(row.name)}</span></h2><p class="${row.id === 'YURIPR' ? 'blocked' : 'status'}">${esc(statusLabel)}</p><p>${esc(row.actions)}</p>${row.limitations ? '<p class="note">' + esc(row.limitations) + '</p>' : ''}<div class="reference"><img alt="Accepted ${row.id} representative" src="${await uri(reference)}"><p>Accepted representative reference. Independent art sample; it may show a different pose from the matched runtime pair below.</p></div>${pairs.join('')}<p>Runtime ${row.effectiveDensity}x · ${(row.gpuBytes / 1048576).toFixed(2)} MiB · ${row.authoredPositions} authored positions · ${esc(row.members.join(', '))}</p><button data-video="${row.id}">Play native action recording</button><div class="movie"></div><details><summary>State coverage and evidence</summary><p>${esc(row.nativeEvidence)}</p><p>${esc(row.sweepEvidence)}</p><ul>${Object.entries(
            row.requiredStates,
        )
            .map(([state, v]) => '<li>' + esc(state) + ': ' + esc(v.status) + '</li>')
            .join('')}</ul>${special.join('')}</details></article>`,
    );
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Soviet units — complete-family review v3</title><style>
:root{color-scheme:dark}body{margin:0;background:#121719;color:#e9efed;font:17px/1.5 system-ui}header,main{max-width:1260px;margin:auto;padding:28px}h1{font-size:32px;margin:0 0 12px}h2{font-size:25px}h2 span{font-weight:400;color:#bac7c0;font-size:19px}nav{display:flex;gap:10px;flex-wrap:wrap;position:sticky;top:0;background:#121719ee;padding:14px;z-index:2}button,select{font:inherit;background:#283b36;color:white;border:1px solid #738e82;border-radius:5px;padding:9px 15px;cursor:pointer}article{border:1px solid #43584f;border-radius:10px;padding:24px;margin:24px 0;background:#1a2222}article[hidden]{display:none}.status{color:#a7d1b1}.blocked,.note{color:#ffd398}.reference{display:flex;gap:22px;align-items:center}.reference p{max-width:520px;color:#b7c6bd}.pair{display:flex;gap:12px;align-items:flex-start;overflow:auto}img{max-width:none;height:auto}figure{margin:20px 0}figcaption{color:#b7c6bd;margin-bottom:8px}summary{cursor:pointer}video{display:block;max-width:100%;height:auto;margin-top:16px}li{margin:6px 0}.small{color:#b7c6bd}a{color:#9bd5be}</style>
<header><h1>Soviet units · Complete-family review v3</h1><p>24 identities · 17 accepted HD families · 5 corrections ready for review · SQD Original · YURIPR upstream blocked.</p><p>The other previously reviewed units are accepted. HARV action video now excludes diagnostic resource switching; HYD, DRED and SUB hull coverage is corrected. DESO green back canisters cover every visible-canister pose; upper-right firing no longer scales the body with the muzzle flash. No all-unit completion is claimed.</p><p>Images below use one captured buffer pixel per CSS pixel, without unit enlargement. Native matches use reference height 900, camera zoom 1 and 1491 × 1080 output. Browser zoom should remain 100%. Videos fit the window; use full screen for closer inspection.</p><p>Combined HD textures: ${(coverage.memory.combinedBytes / 1048576).toFixed(2)} MiB / 256 MiB. Runtime shadows are preserved; the isolated representative boards are not shadow validation.</p><p class="small">All images and videos are embedded. Open this file directly; no server or network is needed. Failed experiments remain in the evidence archive. Snow/urban, Windows, physical panels, long battles and campaigns are not certified here.</p></header>
<main><nav><button data-group="all">All units</button><button data-group="infantry">Infantry</button><button data-group="ground">Ground</button><button data-group="air-naval">Air / naval</button><select aria-label="Jump to unit"><option value="">Jump to unit</option>${rows.map((r) => '<option>' + r.id + '</option>').join('')}</select></nav>${cards.join('')}</main>
<script id="media" type="application/json">${JSON.stringify(media)}</script><script>
const media=JSON.parse(document.getElementById('media').textContent);let active;
for(const button of document.querySelectorAll('nav button'))button.onclick=()=>{for(const card of document.querySelectorAll('article'))card.hidden=button.dataset.group!=='all'&&card.dataset.group!==button.dataset.group;};
document.querySelector('select').onchange=e=>{const card=document.getElementById(e.target.value);if(card){card.hidden=false;card.scrollIntoView();}};
for(const button of document.querySelectorAll('[data-video]'))button.onclick=()=>{if(active){active.video.pause();active.video.remove();URL.revokeObjectURL(active.url);}const binary=atob(media[button.dataset.video]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:'video/webm'})),video=document.createElement('video');video.controls=true;video.src=url;button.nextElementSibling.append(video);active={video,url};video.play().catch(()=>{});};
</script></html>`;
await fs.writeFile(path.join(out, 'Soviet-Units-Full-Review-v3.html'), html);
await fs.copyFile(
    path.join(evidence, 'production-deso-review-v17/review.html'),
    path.join(out, 'DESO-Green-Canisters-Complete-Review.html'),
);
await fs.copyFile(
    path.join(evidence, 'deso-fire-scale-v1/status.json'),
    path.join(out, 'deso-correction-status.json'),
);
const profile = path.join(out, 'Review Profile');
await fs.mkdir(profile);
await write(path.join(profile, 'resource-registration.json'), {
    schemaVersion: 1,
    directory: path.join(root, '.local'),
});
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const launcher = path.join(out, 'Launch Unit Review.command');
await fs.writeFile(
    launcher,
    '#!/bin/bash\nset -e\nexport RA2_DESKTOP_USER_DATA=' +
        quote(profile) +
        '\nexport RA2_DESKTOP_NO_DISCOVERY=1\nexec ' +
        quote(artifact.executable) +
        '\n',
);
await fs.chmod(launcher, 0o755);
const wrapper = path.join(out, 'Soviet Unit Review.app');
await fs.mkdir(path.join(wrapper, 'Contents/MacOS'), { recursive: true });
const wrapperExecutable = path.join(wrapper, 'Contents/MacOS/Launch');
await fs.writeFile(
    wrapperExecutable,
    '#!/bin/bash\nset -e\nexport RA2_DESKTOP_USER_DATA=' +
        quote(profile) +
        '\nexport RA2_DESKTOP_NO_DISCOVERY=1\nexec ' +
        quote(artifact.executable) +
        ' "$@"\n',
);
await fs.chmod(wrapperExecutable, 0o755);
await fs.writeFile(
    path.join(wrapper, 'Contents/Info.plist'),
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Launch</string><key>CFBundleIdentifier</key><string>local.ra2hd.m17.reviewlauncher</string><key>CFBundleName</key><string>Soviet Unit Review</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string></dict></plist>',
);

await fs.writeFile(
    path.join(out, 'README.md'),
    `# M1.7 local unit review\n\nStatus: PARTIAL_BATCH_DELIVERED / NAMED_CORRECTIONS_PENDING. Seventeen HD families are accepted. DESO/HARV/HYD/DRED/SUB corrections have native evidence and await review. SQD uses Original. DESO green-canister artwork covers the complete 322-slot member; prior versions remain preserved. YURIPR stays Original because its native Psi Wave kills its caster. No gameplay rule was changed.\n\nOpen Soviet-Units-Full-Review-v3.html directly. It embeds all media and requires no server. Open Soviet Unit Review.app (or Launch Unit Review.command) to run the combined Mac app using this disposable review profile. The application is ${artifact.artifact}. The resource registration points to ${path.join(root, '.local')}; keep that directory available. Ordinary Graphics HD controls restore Original. No existing profile is modified.\n\nUnit Resources v3 and its ZIP contain the versioned external 24-family candidate resources, excluding retail data and preserved baseline artwork. coverage.json is the consolidated state/dependency/memory ledger; preservation.json verifies accepted resources and representative files. The isolated unit branch includes building checkpoint ${coverage.buildingCheckpoint}; it is not merged back into the active main checkout.\n\nKnown limits: ${coverage.limits.join(' ')}\n\nContinue this same task for corrections and final acceptance, including the named YURIPR exception. Do not claim M1_7_ACCEPTED_AND_DELIVERED until that scope is explicitly agreed and accepted.\n`,
);
ledger.status = 'PARTIAL_BATCH_DELIVERED';
ledger.stage = 'NAMED_CORRECTIONS_PENDING';
ledger.completeNewFamilies = 17;
ledger.technicalTemperateFamilies = 22;
ledger.newRuntimeActivation = rows
    .filter((r) => !['YURIPR', 'SQD'].includes(r.id))
    .map((r) => r.id);
ledger.fullResourceDelivery =
    '24_CANDIDATE_FAMILIES_22_RUNTIME_1_USER_ORIGINAL_1_UPSTREAM_BLOCKED_5_CORRECTIONS_PENDING';
ledger.finalAcceptance = 'ACCEPTED_EXCEPT_NAMED_CORRECTIONS_AND_BLOCKERS';
ledger.combinedMacApp = artifact.artifact;
ledger.currentFullReview = path.join(out, 'Soviet-Units-Full-Review-v3.html');
ledger.consolidatedCoverage = path.join(out, 'coverage.json');
ledger.memoryPolicy.currentMeasured = coverage.memory;
ledger.memoryPolicy.newRuntimeAllocatedBytes = coverage.memory.unitBytes;
ledger.memoryPolicy.combinedPeak = coverage.memory.combinedBytes;
ledger.memoryPolicy.unitBudgetBytes = mixed.memory.budget;
ledger.memoryPolicy.currentBaselineBytes = coverage.memory.acceptedBaselineBytes;
ledger.memoryPolicy.decision =
    'Shared immutable whole-family demand loading; losslessly pooled SHP at authored 2x and VXL at registered 4x. Accepted baseline and total cap unchanged; failed families remain Original before publication.';

await write(path.join(evidence, 'ledger.json'), ledger);
await write(path.join(out, 'delivery.json'), {
    status: coverage.status,
    app: artifact.artifact,
    source: artifact.source.head,
    sourceDigest: artifact.source.sourceDigest,
    reviewLauncher: wrapper,
    coverage: 'coverage.json',
    review: 'Soviet-Units-Full-Review-v3.html',
    resources: 'Soviet-Unit-Resources-v3.zip',
    resourceFiles: files.size,
    resourceBytes: [...files.values()].reduce((n, f) => n + f.bytes, 0),
    reviewBytes: Buffer.byteLength(html),
    reviewSha256: hash(html),
    resourceZipSha256: hash(await fs.readFile(path.join(out, 'Soviet-Unit-Resources-v3.zip'))),
});
console.log(out);
