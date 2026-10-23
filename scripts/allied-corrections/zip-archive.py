"""Verify staged bytes, symlinks and executable modes inside a fresh Mac ZIP."""
import hashlib
import json
import os
import stat
import subprocess
import sys
import zipfile
from pathlib import Path

out=Path(sys.argv[1]).resolve()
receipt=json.loads((out/'stage-receipt.json').read_text());folder=Path(receipt['folder'])
archive=out/(folder.name+'.zip');assert not archive.exists()
subprocess.run(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',str(folder),str(archive)],check=True)
checked=0
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert not any('/Trainer-Review-Profile/' in n or '/UserData/' in n for n in z.namelist())
    for directory,dirs,files in os.walk(folder,followlinks=False):
        paths=[Path(directory)/name for name in files]
        paths += [Path(directory)/name for name in dirs if (Path(directory)/name).is_symlink()]
        for file in paths:
            entry=z.getinfo(folder.name+'/'+file.relative_to(folder).as_posix());mode=entry.external_attr>>16
            with z.open(entry) as stream:
                if file.is_symlink():
                    assert stat.S_ISLNK(mode)
                    assert stream.read().decode()==os.readlink(file)
                else:
                    with file.open('rb') as original:
                        assert hashlib.file_digest(stream,'sha256').digest()==hashlib.file_digest(original,'sha256').digest(),file
                    assert bool(mode&stat.S_IXUSR)==bool(file.stat().st_mode&stat.S_IXUSR),file
            checked+=1
with archive.open('rb') as stream:sha256=hashlib.file_digest(stream,'sha256').hexdigest()
result={**receipt,'status':'PASS_ARCHIVE_BYTES_LINKS_MODES_AND_NO_PROFILES','archive':str(archive),
        'bytes':archive.stat().st_size,'sha256':sha256,'checkedFiles':checked}
(out/'archive-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
