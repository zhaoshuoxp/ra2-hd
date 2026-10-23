"""Correct an adjacent building label without changing frozen artwork or evidence."""
from copy import deepcopy
from pathlib import Path
from newurban_batch96_io import GUIDE, ROOT, pin, read, write

guide = read(GUIDE / 'source.json')
statue, = [s for s in guide['sources'] if s['member'] == 'cnnewy04.shp']
assert statue['bindings'][0]['id'] == 'CANEWY04'
assert statue['nativeRules']['Name'] == 'Statue of Liberty'
assert statue['bindings'][0]['mapIds'] == ['yr:manhatta.map']
previous = read(ROOT / 'review-v2/review-metadata-v1.json')
old = Path(previous['html']['file'])
assert pin(old) == previous['html']
text = old.read_text()
wrong = 'CASANF18, the statue body above it'
right = 'CANEWY04, the statue body above it'
assert text.count(wrong) == 1
folder = ROOT / 'review-v3'; folder.mkdir(exist_ok=False)
file = folder / old.name
with file.open('x') as stream:
    stream.write(text.replace(wrong, right))
metadata = deepcopy(previous)
metadata['html'] = pin(file)
metadata['editorialCorrection'] = dict(reason='The adjacent Manhattan statue is CANEWY04; CASANF18 is a distinct Rush Hour source.',
    originalSourceGuide=pin(GUIDE / 'source.json'), originalSourceSha256=statue['sha256'],
    correctedIdentity='CANEWY04', originalRulesName=statue['nativeRules']['Name'],
    previousHtml=previous['html'], imagePayloadsChanged=False, resourceOrRuntimeChanged=False)
write(folder / 'review-metadata-v1.json', metadata)
receipt = ROOT / 'review-identity-correction-v1.json'
write(receipt, dict(status='CORRECTED_ADJACENT_BUILDING_IDENTITY_ONLY', previousHtml=previous['html'],
    correctedHtml=pin(file), correctedMetadata=pin(folder / 'review-metadata-v1.json'),
    originalSourceGuide=pin(GUIDE / 'source.json'), sourceIdentity='CANEWY04', sourceMember='cnnewy04.shp',
    sourceSha256=statue['sha256'], nativeOrStaticArtworkChanged=False, nativeRerunRequired=False,
    previousFilesPreserved=True, m24Complete=False))
closure = deepcopy(read(ROOT / 'coverage-and-native-closure-v1.json'))
closure['review'] = pin(file)
closure['reviewMetadata'] = pin(folder / 'review-metadata-v1.json')
closure['reviewIdentityCorrection'] = pin(receipt)
closure['inheritedTechnicalClosure'] = pin(ROOT / 'coverage-and-native-closure-v1.json')
write(ROOT / 'coverage-and-native-closure-v2.json', closure)
document = {key: value for key, value in closure.items() if key != 'sourcePaths'}
document['technicalClosure'] = pin(ROOT / 'coverage-and-native-closure-v2.json')
Path('docs/m2-4-newurban-final-terrain-batch96-20261021.json').write_text(__import__('json').dumps(document, indent=2) + '\n')
print(dict(status='REVIEW_LABEL_CORRECTED_WITH_FROZEN_PRIOR_EVIDENCE_RETAINED', html=pin(file)))
