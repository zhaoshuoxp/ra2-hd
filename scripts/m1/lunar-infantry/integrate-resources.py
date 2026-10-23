"""Copy only additive Lunar resources and atomically select the preserved UI superset."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

root = Path.cwd()
main = Path('/Users/Aone/RA2remaster/ra2-hd')
out = root/'.artifacts/lunar-infantry'
for name in ['native-desktop-2x-v1', 'native-desktop-4x-v1']:
    assert json.loads((out/name/'report.json').read_text())['status'] == 'PASS_SELECTED_NATIVE_CASES'
assert subprocess.check_output(['git', 'branch', '--show-current'], cwd=main, text=True).strip() == 'main'
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=main, text=True).strip()
receipt = json.loads((out/'cameo-exports-v1/receipt.json').read_text())
pointer = main/'.local/ui-selection.json'
assert json.loads(pointer.read_text()) == receipt['previous']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
old = main/'.local/ui-packs'/receipt['previous']['revision']
old_files = {p.relative_to(old): sha(p) for p in old.rglob('*') if p.is_file()}
copied = []
for relative in ['hd-packs/lunar-infantry-authored', 'hd-packs/lunar-infantry-family',
                 'ui-packs/lunar-infantry-ui-v1']:
    source, target = root/'.local'/relative, main/'.local'/relative
    assert not target.exists(), target
    shutil.copytree(source, target)
    for p in source.rglob('*'):
        if p.is_file():
            assert sha(p) == sha(target/p.relative_to(source))
            copied.append(str(Path(relative)/p.relative_to(source)))
new = json.loads((main/'.local/ui-packs/lunar-infantry-ui-v1/manifest.json').read_text())
previous = json.loads((old/'manifest.json').read_text())
assert new['assets'][:488] == previous['assets']
for name, digest in old_files.items():
    assert sha(old/name) == digest
temp = pointer.with_name('ui-selection-lunar-v1.tmp')
assert not temp.exists()
temp.write_text(json.dumps(receipt['selection'], indent=2)+'\n')
temp.replace(pointer)
(out/'main-resource-copy-v1.json').write_text(json.dumps(dict(
    status='PASS_ADDITIVE_MAIN_RESOURCE_COPY', copied=copied, preservedUiFiles=len(old_files),
    preservedUiEntries=488, uiEntries=490, selection=receipt['selection']), indent=2)+'\n')
print('PASS_ADDITIVE_MAIN_RESOURCE_COPY', len(copied))
