"""Select only the statically verified complete grouped batch in the task worktree."""
from pathlib import Path

from newurban_batch89_io import ROOT, pin, read, write

export = read(ROOT / 'export-and-preservation-v1.json')
audit = read(ROOT / 'static-audit-v1.json')
assert audit['status'] == 'PASS_TWELVE_COMPLETE_FAMILIES_LINKED_PIXEL_PRESERVATION_AND_CONTINUOUS_RUBBLE'
assert audit['counts'] == dict(exact=222, semantic=4, authored=24, empty=32, shadows=93)
contract = Path('desktop/environment-newurban-hd-contract.json')
selector = Path('.local/environment-newurban-selection.json')
assert read(contract) == read(ROOT / 'baseline-contract.json')
assert read(selector) == export['baseline']
candidate = read(ROOT / 'contract-candidate-v1.json')
assert candidate['selectedPack'] == export['candidate']
files = [pin(p) for p in sorted((ROOT / 'actual-density-inspection-v1').glob('*.png'))]
assert len(files) == 6
write(ROOT / 'visual-source-inspection-v1.json', dict(status='ALL_TWELVE_ACTUAL_4X_SUBJECTS_INTERNAL_INSPECTION_PASS',
    files=files, density=4, imagesRescaled=False,
    semanticAdaptation=pin(ROOT / 'stadium-d-semantic-reuse-v1.json'), userVisualAcceptance='PENDING'))
write(ROOT / 'selection-v1.json', dict(status='STATIC_PASS_TWELVE_COMPLETE_FAMILIES_SELECTED_NATIVE_AND_VISUAL_PENDING',
    baseline=export['baseline'], candidate=export['candidate'], previousContract=pin(contract), previousSelector=pin(selector),
    audit=pin(ROOT / 'static-audit-v1.json'), newFamilies=12, sourceMembers=14,
    disclosure='Twelve continuous rubble studies, exact accepted linked loops and body states, plus explicit D advertising-sign semantic reuse. No original source or gameplay change.',
    windows='NOT_RUN', m24Complete=False))
contract.write_text(__import__('json').dumps(candidate, indent=2) + '\n')
selector.write_text(__import__('json').dumps(export['candidate'], indent=2) + '\n')
print(export['candidate'])
