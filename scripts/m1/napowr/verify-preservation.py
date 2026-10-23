"""Verify every pre-existing protected entry; retain cache drift as a strict failure."""
import hashlib
import json
from pathlib import Path
root=Path('.artifacts/m1-6a');before=json.loads((root/'preservation-before.json').read_text())
out=root/'preservation-final.json';assert not out.exists()
changed=[];checked=0
for base,rows in before['roots'].items():
 for row in rows:
  p=Path(base)/row['path'];checked+=1
  if not p.exists() and not p.is_symlink():changed.append(dict(path=str(p),reason='missing'));continue
  stat=p.lstat();now=dict(path=row['path'],size=stat.st_size,mtime_ns=stat.st_mtime_ns,mode=stat.st_mode)
  if 'link' in row:now['link']=str(p.readlink())
  if 'sha256' in row:
   with p.open('rb')as f:now['sha256']=hashlib.file_digest(f,'sha256').hexdigest()
  if row!=now:changed.append(dict(path=str(p),before=row,after=now))
source=Path('/Users/Aone/RA2remaster/Resource/Command and Conquer Red Alert II')
archives={}
for p in source.iterdir():
 if p.name in before['sourceArchives']:
  with p.open('rb')as f:archives[p.name]=hashlib.file_digest(f,'sha256').hexdigest()
assert archives==before['sourceArchives']
oldlocal={r['path']for r in before['roots'][str(Path.cwd()/'.local')]}
added=[str(p.relative_to('.local'))for p in Path('.local').rglob('*')if str(p.relative_to('.local'))not in oldlocal]
assert all(p.startswith('hd-packs/soviet-power-plant-authored')for p in added),added
knowncache=['/RA2 HD M1.5/Partitions/ra2-offline/'+n+'/data_1'for n in ['GPUCache','DawnGraphiteCache','DawnWebGPUCache']]
unexpected=[r for r in changed if not any(r['path'].endswith(s)for s in knowncache) and r['path']!=str(Path.cwd()/'.local/hd-packs')]
report=dict(strictStatus='FAIL_PREEXISTING_PROFILE_CACHE_DRIFT'if changed else'PASS',protectedEntriesChecked=checked,sourceArchivesUnchanged=True,addedLocalEntries=added,changed=changed,unexpected=unexpected,taskOwnedResourceOverwrite=False)
out.write_text(json.dumps(report,indent=2)+'\n')
assert not unexpected,unexpected
print(json.dumps({k:v for k,v in report.items()if k not in ['addedLocalEntries','changed','unexpected']}))
