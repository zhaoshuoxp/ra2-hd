"""Create one versioned addition; never include retail files, profiles or old art."""
import hashlib
import json
import zipfile
from pathlib import Path

root=Path('.artifacts/m1-6b')
out=root/'resource-addition-r2'
out.mkdir(exist_ok=False)
packs=json.loads((root/'family-packs-2.json').read_text())
paths=set()
for record in packs.values():
    path=Path(record['family']);paths.add(path)
    assert hashlib.sha256(path.read_bytes()).hexdigest()==record['sha256']
    family=json.loads(path.read_text())
    for member in family['members']:
        directory=Path('.local/hd-packs')/member['packId']/member['revision']
        manifest=directory/'manifest.json';paths.add(manifest)
        assert hashlib.sha256(manifest.read_bytes()).hexdigest()==member['sha256']
        data=json.loads(manifest.read_text())
        for variant in data['variants']:
            for page in variant['pages']:
                for role in ['base','data']:
                    image=directory/page[role];paths.add(image)
                    assert hashlib.sha256(image.read_bytes()).hexdigest()==page[role+'Sha256']
inventory=[dict(path=str(p.relative_to('.local')),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted(paths)]
manifest=dict(milestone='M1.6b',revision=2,status='COMPLETE_REVIEW_CANDIDATE_FINAL_VISUAL_ACCEPTANCE_PENDING',
              requires='Existing accepted M1.6a external resource folder',families=packs,files=inventory,
              exclusions=['retail archives','accepted NAPOWR and previous HD assets','applications','profiles','raw generations','test fixtures'])
(out/'M1.6b-resource-addition.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'INSTALL.txt').write_text('''M1.6b Soviet building resource addition, revision 2

This Mac already has these new resources installed at:
/Users/Aone/RA2remaster/ra2-hd/.local

Open the combined Red Alert 2 HD M1.6b application. If prompted for resources,
choose that existing .local folder. No retail reimport is required.
In Options, select HD for Soviet Barracks, Soviet Ore Refinery, Soviet War
Factory and Soviet Construction Yard. Building choices apply next match.
Original remains the default for new choices. Use a temperate skirmish map.

The ZIP is a companion addition for the existing accepted resource folder.
Merge its hd-packs folder into that resource folder. It contains only new
soviet-nahand, soviet-narefn, soviet-naweap and soviet-nacnst revision-2 paths.
Do not replace an existing differently hashed file at those exact paths.
The included JSON lists every byte size and SHA-256 identity.

With all accepted HD assets selected, the four new families use complete 2x
sets under the combined texture budget. Missing or incompatible resources
fall back independently for the affected family. Snow and urban stay Original.

The app uses its own RA2 HD M1.6b profile. Previous apps, saved choices, profiles
and accepted resource paths remain separate. This is a local Mac arm64 review
delivery; final consolidated appearance/gameplay acceptance is still pending.
''')
archive=out/'M1.6b-Soviet-Buildings-Resource-Addition-r2.zip'
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_STORED) as z:
    for p in sorted(paths):z.write(p,str(p.relative_to('.local')))
    for name in ['M1.6b-resource-addition.json','INSTALL.txt']:z.write(out/name,name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.infolist())==len(paths)+2
receipt=dict(archive=str(archive),sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),bytes=archive.stat().st_size,
             files=len(paths),alreadyInstalledAt=str(Path('.local').resolve()),installation=str(out/'INSTALL.txt'))
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
