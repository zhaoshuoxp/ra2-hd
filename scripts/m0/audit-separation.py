"""Audit local asset hashes against build files and new Git paths."""
import hashlib
import json
import subprocess
from pathlib import Path

extensions = {'.mix', '.csf', '.shp', '.vxl', '.hva', '.vpl', '.pal', '.map', '.mmx', '.bag', '.bik'}
local_hashes = set()
for p in Path('.local').rglob('*'):
    if p.is_file() and p.suffix in extensions:
        with p.open('rb') as stream:
            local_hashes.add(hashlib.file_digest(stream, 'sha256').hexdigest())
build_matches = []
build_assets = []
for p in Path('dist').rglob('*'):
    if p.is_file():
        if p.suffix.lower() in extensions:
            build_assets.append(str(p))
        with p.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() in local_hashes:
                build_matches.append(str(p))
tracked = subprocess.check_output(['git', 'ls-files'], text=True).splitlines()
existing_upstream = [p for p in tracked if Path(p).suffix.lower() in extensions]
new_files = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
new_asset_paths = [p for p in new_files if Path(p).suffix.lower() in extensions or p.startswith(('.local/', '.artifacts/'))]
report = dict(build_archive_extensions=build_assets, build_hash_matches=build_matches,
              new_unignored_asset_paths=new_asset_paths, upstream_index_asset_paths=existing_upstream,
              remaining_worktree_upstream_assets=[p for p in existing_upstream if Path(p).exists()],
              history_contains_upstream_binaries=True, distribution_authorized=False)
Path('.artifacts/separation-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
assert not build_assets and not build_matches and not new_asset_paths
assert not report['remaining_worktree_upstream_assets']
