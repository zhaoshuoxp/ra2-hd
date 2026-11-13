"""Add an immutable coherent collapse family without replacing prior resources."""
import copy
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda value: (json.dumps(value, indent=2)+'\n').encode()
sha = lambda data: hashlib.sha256(data).hexdigest()
directory = ROOT / '.local/campaign/yr/sov07tmd'
stage = ROOT / '.artifacts/yr-campaign/castle-rigid-r10'
proof = read(stage/'report.json')
assert len(proof['exports']) == 174
contract_file = ROOT/'desktop/environment-hd-contract.json'
campaign_file = directory/'manifest.json'
contract, campaign = read(contract_file), read(campaign_file)
previous = 'yr-feedback-castle-collapse-r3'
family = 'yr-feedback-castle-collapse-r11'
assert contract['identities']['yr']['CATR03DM'] == previous and family not in contract['families']
metadata = read(directory/(previous+'-member.json'))
assert proof['sourceSha256'] == metadata['source']['sha256']
prior = copy.deepcopy(metadata)
exports = {(row['density'], row['frame']): row for row in proof['exports']}
retained = ROOT/'.local/source-art/yr-campaign-v1/transylvania-castle-collapse/coherent-r11'
shutil.copytree(stage, retained)
payloads = {}
for variant in metadata['variants']:
    density = variant['density']
    for page in variant['pages']:
        # Data pages contain the original neutral ownership/depth contract.
        assert sha((directory/page['data']).read_bytes()) == page['dataSha256']
        atlas = Image.new('RGBA', tuple(page['size']))
        for frame in [f for f in variant['frames'] if f['page'] == page['id']]:
            slot = frame['nativeFrame']
            file = retained/str(density)/f'{slot:03}.png'
            assert sha(file.read_bytes()) == exports[density, slot]['sha256']
            whole = Image.open(file).convert('RGBA')
            assert whole.size == tuple(v*density for v in metadata['logical']['canvas'])
            geometry = metadata['logical']['frames'][slot]
            ox, oy = [v*density for v in geometry['trimOrigin']]
            x, y, width, height = frame['sampleRect']
            sprite = whole.crop((ox, oy, ox+width, oy+height))
            content_width, content_height = [value*density for value in geometry['trimSize']]
            if content_width < width:
                sprite.paste((0, 0, 0, 0), (content_width, 0, width, height))
            if content_height < height:
                sprite.paste((0, 0, 0, 0), (0, content_height, width, height))
            atlas.paste(sprite, (x, y))
        file = directory/f'{family}-{density}-{page["id"]}-base.png'
        assert not file.exists()
        atlas.save(file)
        data = file.read_bytes()
        payloads[file.name] = data
        page.update(base=file.name, baseSha256=sha(data), baseBytes=len(data))
metadata['packRevision'] = family
metadata['color']['authoredAnimation']['alpha'] = 'Continuous HD master alpha; original pixel contours are not enlarged into smoke.'
metadata['color']['materialContinuity'] = dict(schema='coherent-rigid-hd-collapse-v1',
    recipe='scripts/yr-campaign/prepare-castle-rigid-collapse.py',
    recipeSha256=sha((ROOT/'scripts/yr-campaign/prepare-castle-rigid-collapse.py').read_bytes()),
    independentDensities=[2, 4], retainedMaterialFrames=proof['retainedMaterialFrames'],
    authoredEffects='Source-positioned effects sampled independently from the retained HD masters.',
    originalSourceFramesRatePivotsTrimAndSeparateShadowsUnchanged=True,
    sourceRgbUsedAsOutputPaint=False, reportSha256=sha((stage/'report.json').read_bytes()))
assert metadata['logical'] == prior['logical']
assert [[(f['nativeFrame'], f['page'], f['sampleRect'], f['contentRect']) for f in v['frames']]
    for v in metadata['variants']] == [[(f['nativeFrame'], f['page'], f['sampleRect'], f['contentRect'])
    for f in v['frames']] for v in prior['variants']]
declared = copy.deepcopy(contract['families'][previous])
declared['familyHash'] = sha(encode(dict(previous=declared['familyHash'], family=family,
    continuity=metadata['color']['materialContinuity'])))
contract['families'][family] = declared
contract['identities']['yr']['CATR03DM'] = family
name = family+'-member.json'
payloads[name] = encode(metadata)
payloads['environment-family-'+family+'.json'] = encode(dict(schema='campaign-environment-extension-v1',
    identity=family, familyHash=declared['familyHash'], mission='sov07tmd.map', theater='TEMPERATE',
    edition='yr', revision=family, members=[dict(member=metadata['source']['member'], manifest=name,
    sha256=sha(payloads[name]))], acceptance='USER_REOPENED_COLLAPSE_NATIVE_AND_VISUAL_REVIEW_PENDING'))
existing = {row['name'] for row in campaign['files']}
assert len(campaign['files'])+len(payloads) <= 256
for name, data in payloads.items():
    assert name not in existing
    file = directory/name
    if file.exists():
        assert file.read_bytes() == data
    else:
        file.open('xb').write(data)
    campaign['files'].append(dict(name=name, bytes=len(data), sha256=sha(data),
        route=f'/local-campaign/yr/sov07tmd/{name}'))
campaign_file.write_bytes(encode(campaign))
contract_file.write_bytes(encode(contract))
receipt = dict(schema='yr-castle-collapse-continuity-registration-v1',
    status='SELECTED_SOURCE_TIMED_CONTINUITY_NATIVE_REVIEW_PENDING', family=family,
    sourceSha256=proof['sourceSha256'], originalBodyFrames=87, originalSeparateShadowFrames=87,
    retainedAuthoring=str(retained.relative_to(ROOT)), authoringReportSha256=sha((stage/'report.json').read_bytes()),
    addedFiles=len(payloads), priorPayloadsChanged=0, castleIntactDamageAndRubbleFamilyUnchanged=True,
    originalMapsPivotsTrimRateAndAnimationLifecycleUnchanged=True, independentDensities=[2, 4],
    reconstruction='Original event intervals drive rigid portions of one coherent HD castle. A coherent rubble state appears beneath the falling parts. Original effect masks register clean HD master effects without clipping to native pixel contours.',
    geometryQualification='Original logical cards, trim origins/sizes, pivots, shadows, 87 slots and clock are exact. Interior visible collapse contours follow reconstructed coherent parts.',
    userVisualAcceptance='PENDING')
(ROOT/'docs/yr-campaign-castle-collapse-continuity-20261109.json').open('xb').write(encode(receipt))
print(json.dumps(receipt))
