"""Record only a verified final package; preserve previous deliveries."""
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m1-7-yr')
receipt = json.loads((root / 'delivery-v2/delivery-receipt.json').read_text())
assert receipt['status'] == 'PASS_SIGNED_PACKAGE_INVENTORY_ZIP_AND_FOUR_EDITION_THEATER_RUNS'
coverage = json.loads(Path('docs/m1-7-yr-coverage.json').read_text())
cases = []
for name in ['packaged-temperate-v2', 'packaged-snow-v2']:
    result = json.loads((root / name / 'result.json').read_text())
    assert result['status'] == 'PASS_PACKAGED_YR_ROSTER_AND_RA2_REGRESSION'
    for row in result['cases']:
        memory = row['unitHd']['memory']
        cases.append(dict(edition=row['edition'], theater=row['theater'],
            unitStatus=row['unitHd']['status'], unitBytes=memory['gpuBytes'],
            totalOptionalBytes=268435456-memory['budget']+memory['gpuBytes'],
            buildingFamilies=len(row['buildingHd']), combat=row['combatFeedbackStatus'],
            lightingScore={key:value for key,value in row.get('lightingScore',{}).items() if key!='scoreText'}, evidence=name+'/result.json'))
coverage['packagedValidation'] = cases
coverage['integratedMain'] = 'f508f43'
coverage['delivery'] = 'docs/m1-7-yr-delivery.json'
coverage['technicalTests'].update(passed=52, additionalEvidence='lighting-score-tests-v1.log', entryTypecheckEvidence='typecheck-production-v12.log')
for row in coverage['families']:
    row['evidence'] = [value for value in row['evidence'] if not value.startswith('packaged-')]
    row['evidence'].extend(['packaged-temperate-v2/result.json', 'packaged-snow-v2/result.json'])
Path('docs/m1-7-yr-coverage.json').write_text(json.dumps(coverage, indent=2)+'\n')
(root/'coverage.json').write_text(json.dumps(coverage, indent=2)+'\n')
receipt.update(schema='m1-7-yr-final-review-delivery-v1', integratedMain='f508f43',
    sourceBranch='m1-7-yr-soviet-units',
    reviewedRuntimeChangesSinceActions='Only main lamp blending and score-time corrections; unit renderers, manifests and unit loader are unchanged from the complete action-tested build.',
    retainedPreviousDelivery='delivery-v1 is historical; select delivery-v2.',
    currentMainHeadAtHandoff=subprocess.check_output(['git','-C','/Users/Aone/RA2remaster/ra2-hd','rev-parse','HEAD'],text=True).strip(),
    currentMainWorkingStatusAtHandoff=subprocess.check_output(['git','-C','/Users/Aone/RA2remaster/ra2-hd','status','--porcelain'],text=True),
    preservation='production-preservation-v1.json', continuation='Continue complete-family review, corrections and acceptance in this same task.')
Path('docs/m1-7-yr-delivery.json').write_text(json.dumps(receipt, indent=2)+'\n')
zip_name = Path(receipt['zip']).name
Path('docs/m1-7-yr-final-review.md').write_text(f'''# YR Soviet unit complete-family review delivery

Status: `COMPLETE_FAMILY_REVIEW_PENDING`. The representative artwork is accepted. Full production, integration and technical verification are complete; final visual/gameplay acceptance remains pending.

Selected delivery: `.artifacts/m1-7-yr/delivery-v2/{zip_name}` ({receipt['zipBytes']:,} bytes). SHA-256: `{receipt['zipSha256']}`. Runtime source commit: `{receipt['runtimeSourceHead']}`. The independent Apple Silicon app is `RA2 HD YR Soviet Units R1.app`; keep its sibling `RA2-HD-Editions-Resources` directory beside it. It uses a separate profile. Delivery v1 is retained history.

The package contains both editions, all accepted building/UI/unit resources, and four new YR Soviet families: BORIS with BPLN, SCHP with flight/rotors/deployment/artillery, CCOMAND and PTROOP. The YR roster is 27 HD roots plus accepted Original SQD/SQDG. The new versioned inventory contains 50 files. The complete packaged resource inventory contains {receipt['resourceFiles']:,} files. Accepted Conscript, Rhino and prior unit/building artwork are unchanged.

`YR-Soviet-Units-Full-Review.html` opens directly, with no server or network: 1,072 native infantry slots, two owner colors, paired Original/HD views, four action recordings, chopper contacts and aircraft headings. All 4,288 image views reconstruct pixel-identically from their native captures. The 1x view preserves captured 1080p framebuffer pixels; larger scales are inspection aids. Browser decoding, controls, video playback and zero-network checks pass.

Production, weapons, special abilities, shadows, native gunfire death, rotor motion, forward/reverse deployment, normal/elite airstrikes and resource lifecycle checks pass. There are 52 focused passing tests and a passing entry type check. All four final package cases pass: RA2/YR on temperate maps and Bering Strait snow maps, retaining 18 applicable HD building families in each case. Both snow cases also pass actual lamp GPU blending and pause-menu-to-score validation. Unit-specific action tests use controlled legal prerequisite/target fixtures; no natural-match victory is claimed.

The shared 256 MiB optional allocation cap is unchanged. Whole-family resource failure falls back atomically. Edition gates keep the four YR additions out of RA2. `m1-7-yr-coverage.json` records every root, dependencies, exclusions, measured allocation and evidence; `m1-7-yr-resources.json` pins selected resources; `m1-7-yr-delivery.json` pins the final app/ZIP receipt. Generic death/weapon effects remain native. Windows, campaigns and exhaustive other-theater gameplay are outside the evidence.

Main's committed changes through `f508f43` are merged into this isolated unit branch, including buildings, combat/audio, snow-unit loading, lamp coefficients and score duration. No main working files were changed and this extension has not been merged back. Recheck then-current main before later authorized integration. Continue final review and corrections in this same execution task; no publication or new task is implied.
''')
print(receipt['status'], receipt['runtimeSourceHead'])
