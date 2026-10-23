"""Select ten independently audited complete source families in the isolated task."""
import json
from pathlib import Path

from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
export = read(ROOT / 'export-and-preservation-v1.json')
audit = read(ROOT / 'static-audit-v1.json')
assert audit['status'] == 'PASS_TEN_COMPLETE_ROCK_AND_CRATE_FAMILIES_CONTINUOUS_CONTOURS_AND_NATIVE_SHADOWS'
assert (audit['completeFamilies'], audit['newDensityFrames'], audit['originalShadowSlots']) == (10, 20, 10)
contract = Path('desktop/environment-newurban-hd-contract.json')
selector = Path('.local/environment-newurban-selection.json')
assert read(contract) == read(ROOT / 'baseline-contract.json')
assert read(selector) == read(ROOT / 'baseline-selector.json') == export['baseline']
candidate = read(ROOT / 'contract-candidate-v1.json')
assert candidate['selectedPack'] == export['candidate']
assert len(candidate['families']) == 197
write(ROOT / 'visual-source-inspection-v1.json', dict(
    status='ALL_TEN_ACTUAL_4X_SUBJECTS_INTERNAL_INSPECTION_PASS',
    summary=audit['summary'], density=4, imagesRescaled=False,
    observations='Continuous rock facets and quiet material; smooth timber, rope and rubber contours. Warm native Iso palette retained. No source pixel grid stamped into new visual alpha or RGB.',
    userVisualAcceptance='PENDING'))
write(ROOT / 'selection-v1.json', dict(
    status='STATIC_PASS_TEN_COMPLETE_FAMILIES_SELECTED_NATIVE_AND_VISUAL_PENDING',
    baseline=export['baseline'], candidate=export['candidate'], previousContract=pin(contract),
    previousSelector=pin(selector), audit=pin(ROOT / 'static-audit-v1.json'), newFamilies=10,
    sourceMembers=10, inheritedFamilies=187,
    disclosure='Eight original rock types and both stock crates. Independent 2X/4X authored detail; all native shadows, logical frames, palettes, source files and gameplay remain unchanged.',
    windows='NOT_RUN', m24Complete=False))
contract.write_text(json.dumps(candidate, indent=2) + '\n')
selector.write_text(json.dumps(export['candidate'], indent=2) + '\n')
print(json.dumps(export['candidate']))
