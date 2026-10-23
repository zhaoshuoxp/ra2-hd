"""Verify protected payloads; separate live old-profile drift without rewriting it."""
import hashlib
import json
import sys
import re
import stat as stat_types
from pathlib import Path

root = Path.cwd()
out = root / '.artifacts/soviet-remaining' / (sys.argv[1] if len(sys.argv) > 1 else 'preservation-review.json')
assert not out.exists(), 'Keep prior preservation evidence'
before = json.loads((root / '.artifacts/m1-6b/preservation-before.json').read_text())
source = root.parent / 'Resource/Command and Conquer Red Alert II'
changes, profile_drift, authorized_directory_changes = [], [], []
allowed_additions = '--allow-batch-packs' in sys.argv
checked = 0
for base, rows in before['roots'].items():
    profile = '/Library/Application Support/RA2 HD' in base
    for row in rows:
        path = Path(base) / row['path']
        checked += 1
        current = None
        if path.exists() or path.is_symlink():
            stat = path.lstat()
            current = dict(path=row['path'], size=stat.st_size, mtime_ns=stat.st_mtime_ns, mode=stat.st_mode)
            if 'link' in row:
                current['link'] = str(path.readlink())
            if 'sha256' in row:
                with path.open('rb') as stream:
                    current['sha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
        if row != current:
            change = dict(path=str(path), before=row, after=current)
            if (allowed_additions and path == root / '.local/hd-packs' and current
                    and stat_types.S_ISDIR(row['mode']) and current['mode'] == row['mode']):
                # Adding versioned child directories changes parent size/mtime, not old payloads.
                authorized_directory_changes.append(change)
            else:
                (profile_drift if profile else changes).append(change)
archives = {}
for name in before['sourceArchives']:
    with (source / name).open('rb') as stream:
        archives[name] = hashlib.file_digest(stream, 'sha256').hexdigest()
assert archives == before['sourceArchives']
old_local = {r['path'] for r in before['roots'][str(root / '.local')]}
new_local = [str(p.relative_to(root / '.local')) for p in (root / '.local').rglob('*') if str(p.relative_to(root / '.local')) not in old_local]
unexpected = [p for p in new_local if not (allowed_additions and re.match(r'^hd-packs/soviet-(nahand|narefn|naweap|nacnst|naradr|nadept|nayard|natech|nanrct|naclon|napsis|nalasr|naflak|tesla|nairon|namisl|nawall)(-|/)', p))]
report = dict(stableProtectedPayloads='PASS' if not changes and not unexpected else 'FAIL', entriesChecked=checked,
              sourceArchives='PASS', changes=changes, oldProfileDrift=profile_drift,
              authorizedParentDirectoryMetadata=authorized_directory_changes,
              strictProfileEquality='FAIL' if profile_drift else 'PASS', newLocalEntries=new_local,
              unexpectedLocalAdditions=unexpected,
              taskProfileBoundary='.artifacts/soviet-remaining/<validation-run>/profile; delivered app uses separate RA2 HD Soviet Buildings R1 profile',
              note='Old app runtime drift is observed separately. Exact writer is not traced; no old profile repairs or user app termination.')
accepted = json.loads((root / '.artifacts/soviet-remaining/representative-acceptance.json').read_text())
accepted_files = [row for family in accepted['families'].values() for row in family['files']]
for row in accepted_files:
    assert hashlib.sha256((root / row['path']).read_bytes()).hexdigest() == row['sha256'], row['path']
report['acceptedRepresentativeFilesChecked'] = len(accepted_files)
report['acceptedRepresentatives'] = 'PASS_UNCHANGED'
out.write_text(json.dumps(report, indent=2) + '\n')
assert not changes, changes
assert not unexpected, 'Unexpected local additions outside the authorized batch pack paths'
print(report['stableProtectedPayloads'], checked, 'entries;', len(profile_drift), 'old-profile changes')
