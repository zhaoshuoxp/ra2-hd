"""Pin accepted body donors and continuous-rubble production requests for batch 88."""
import copy
import hashlib
import json
import os
from pathlib import Path

BASE = Path('.artifacts/m2-4')
ROOT = BASE / 'newurban-buildings-batch88-20261020'
PREP = BASE / 'newurban-building-references-batch88-v1'
R1 = BASE / 'newurban-rubble-continuous-r1-20261020'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


acceptance = read(R1 / 'user-acceptance-20261020.json')
assert acceptance['status'] == 'USER_ACCEPTED_NEWURBAN_RUBBLE_CONTINUOUS_R1'
selected = Path('.local/environment-newurban-selection.json')
assert read(selected) == acceptance['candidate']
prep = read(PREP / 'source-preparation-v1.json')
assert prep['completeFamilyCandidates'] == 39 and prep['newRubbleStudiesRequired'] == 37
ROOT.mkdir(exist_ok=False)
os.symlink((BASE / 'newurban-native-v1/native').resolve(), ROOT / 'native')
for name, original in [('baseline-contract.json', Path('desktop/environment-newurban-hd-contract.json')),
                       ('baseline-selector.json', selected), ('source.json', PREP / 'source.json')]:
    with (ROOT / name).open('xb') as stream:
        stream.write(original.read_bytes())
source = read(ROOT / 'source.json')
urban = read(Path('desktop/environment-urban-hd-contract.json'))
proof = read(Path(prep['scopeProof']['file']))
assert sha(Path(prep['scopeProof']['file'])) == prep['scopeProof']['sha256']
proof_rows = {row['member']: row for row in proof['rows']}
contract = dict(schema=read(ROOT / 'baseline-contract.json')['schema'], theater='NEWURBAN',
    preparedSourceSha256=sha(ROOT / 'source.json'), sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
for native, record in zip(source['sources'], prep['records'], strict=True):
    assert native['member'] == record['member'] and native['sha256'] == record['sourceSha256']
    donor_file = Path(record['donorMetadata']['file'])
    assert pin(donor_file) == record['donorMetadata']
    row = proof_rows[native['member']]
    descriptor = copy.deepcopy(urban['sources'][row['donorMember']])
    assert descriptor['bodyFrames'] == 4
    descriptor.update(sha256=native['sha256'], canvas=native['canvas'], totalFrames=8,
        palette=native['palette'], hasShadow=True, remapable=native['remapable'])
    descriptor['framePalettes'] = {str(i): dict(**native['palette'], role='body', runtimeUsed=True,
        remapable=native['remapable']) for i in range(3)}
    descriptor['framePalettes']['3'] = dict(member='isoubn.pal', archive='ra2md.mix/cachemd.mix',
        sha256=record['rubblePalette']['sha256'], bytes=768, role='rubble', remapable=False,
        runtimeUsed=native['member'] != 'cnfarm02.shp')
    contract['sources'][native['member']] = descriptor
    identity = record['identity']
    family = 'newurban-' + identity.lower()
    editions = sorted({binding['edition'] for binding in native['bindings']})
    basis = dict(theater='NEWURBAN', members={native['member']: descriptor}, identities=[identity])
    contract['families'][family] = dict(members=[native['member']], identities=[identity], kinds=['building'],
        editions=editions, familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        contract['identities'][edition][identity] = family
write(ROOT / 'contract.json', contract)
jobs = []
for prepared in prep['generationJobs']:
    file = Path(prepared['reference']['file'])
    assert pin(file) == prepared['reference']
    names = [next(r['identity'] for r in prep['records'] if r['member'] == name) for name in prepared['members']]
    request = (
        'Use case: precise-object-edit. Asset type: production high-resolution RA2 NEWURBAN rubble sprites. '
        'Image 1 is ONLY the original low-resolution geometry and actual source color reference. '
        'Create genuinely new continuous HD forms; the coarse pixels in this input are resolution artifacts, '
        'not tiny physical stones. One column, ' + ('two separate rows, top then bottom: ' if len(names) == 2 else 'one centered subject: ')
        + ', '.join(names) + '. Preserve the isometric flat footprint, low surviving-wall height, principal '
        'wall/roof/debris arrangement, original material identities, broad colors and upper-left light. '
        'Rebuild the rubble as broad coherent broken concrete or brick panels, smooth clean steel and roof '
        'slabs, readable continuous edges, a few naturally fractured larger fragments, quiet fine surface '
        'detail and restrained dust. Keep original defining fragments and openings without tracing pixel '
        'stairs or square holes. Refined accepted RA2 HD material style, continuous silhouettes and crisp '
        'natural edges. Do not turn every source color block into a stone. No gravel field, dense pebbles, '
        'speckle, high-contrast grain, pixel-art, mosaic, sharpening, blur or interpolation as new detail. '
        'No standing building, tall mound, new ground plane, vegetation, snow, smoke, fire, external shadow, '
        'text, labels, checkerboard or frame. Each complete subject must fit inside its own row with very '
        'generous clear margins. Leave at least 160 transparent pixels between subjects; no shared fragments '
        'or touching silhouettes. Truly transparent background. Target 1920 by 1920 with independently drawn '
        'fine geometry and material detail sufficient for complete 2X and 4X exports. Do not draw the old '
        'low-resolution alpha holes or tiny square fragments into the new continuous contour.')
    jobs.append(dict(id=prepared['id'], members=prepared['members'], identities=names,
        originalReference=prepared['reference'], request=request,
        destination=str(ROOT / (prepared['id'] + '-master-v1.png')),
        receiptFile=prepared['id'] + '-output-v1.json', mode='BUILT_IN_IMAGEGEN'))
write(ROOT / 'imagegen-jobs-v1.json', dict(schema='m2-4-newurban-rubble-continuous-jobs-v1',
    sourcePreparation=pin(PREP / 'source-preparation-v1.json'), acceptedStyleAuthority=pin(R1 / 'user-acceptance-20261020.json'),
    helper=pin(Path('scripts/m2-4/newurban_rubble_r1_materials.py')), jobs=jobs))
write(ROOT / 'production-inputs-v1.json', dict(status='SOURCE_PINNED_39_COMPLETE_FAMILY_PRODUCTION_INPUTS',
    sourcePreparation=pin(PREP / 'source-preparation-v1.json'), source=pin(ROOT / 'source.json'),
    contract=pin(ROOT / 'contract.json'), baseline=read(selected), acceptedR1=pin(R1 / 'user-acceptance-20261020.json'),
    completeFamilies=39, exactAcceptedBodyStates=117, newRubbleStudies=37,
    acceptedSourceIdenticalRubbleReuse=['cnnewy07.shp'], nativeUnusedRubbleSlots=['cnfarm02.shp'],
    rulesMapsArchivesModified=False, windows='NOT_RUN', native='NOT_RUN', visual='NOT_YET_GENERATED', m24Complete=False))
print(json.dumps(dict(root=str(ROOT), jobs=len(jobs), families=len(contract['families']))))
