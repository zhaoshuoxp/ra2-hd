"""Prepare exact-source reuse candidates without selecting unaccepted or partial families."""
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.artifacts/m2-4')
urban_file = Path('desktop/environment-urban-hd-contract.json')
urban = read(urban_file)
donors = read(base / 'urban-native-v2/source.json')['sources']
donors.extend(read(base / 'urban-actors-native-batch62-v1/source.json')['sources'])
by_member = {s['member']: s for s in donors}
available = []
for member, descriptor in urban['sources'].items():
    source = by_member.get(member)
    if source and source['sha256'] == descriptor['sha256']:
        available.append(source)
for identity in urban['vxl']:
    source = by_member.get(identity.lower() + '.vxl')
    if source:
        available.append(source)
pending = {'civbbp.shp', 'pres.shp', 'ssrv.shp', 'jeep.vxl', 'ycab.vxl', 'bcab.vxl',
    'ambu.vxl', 'ftrk.vxl', 'civp.vxl'}
results = []
for theater in ['NEWURBAN', 'DESERT']:
    source_file = base / f'{theater.lower()}-native-v1/source.json'
    target = read(source_file)
    selected_file = Path(f'desktop/environment-{theater.lower()}-hd-contract.json')
    selected = read(selected_file)
    candidates = []
    for source in target['sources']:
        if source['format'] not in ['shp', 'vxl']:
            continue
        current = selected['sources'].get(source['member'])
        if current and current['sha256'] == source['sha256'] and current['palette']['sha256'] == source['palette']['sha256']:
            continue
        if source['member'] in ['wini.vxl', 'truckb.vxl']:
            continue  # Already verified Snow-authored theater descriptors; do not recount.
        for donor in available:
            if source['format'] != donor['format'] or source['sha256'] != donor['sha256']:
                continue
            if source['palette']['sha256'] != donor['palette']['sha256']:
                continue
            if source['format'] == 'shp':
                if any(source[field] != donor[field] for field in ['canvas', 'totalFrames', 'hasShadow', 'remapable']):
                    continue
                fields = ['origin', 'size', 'indexSha256', 'rgbaSha256', 'empty']
                if len(source['frames']) != len(donor['frames']) or any(any(a[key] != b[key] for key in fields)
                    for a, b in zip(source['frames'], donor['frames'], strict=True)):
                    continue
            elif source['hva']['sha256'] != donor['hva']['sha256']:
                continue
            candidates.append(dict(member=source['member'], sourceSha256=source['sha256'],
                donorMember=donor['member'], paletteSha256=source['palette']['sha256'],
                format=source['format'], originalMapIds=sorted({m for b in source['bindings'] for m in b['mapIds']}),
                donorBatch62VisualPending=donor['member'] in pending,
                status='EXACT_SOURCE_FRAME_GEOMETRY_AND_FULL_PALETTE_CANDIDATE_ONLY',
                nextGate='Complete target linked-family/source-scope audit and donor acceptance before selection; native target loading remains required.'))
            break
    results.append(dict(theater=theater, prepared=source_file.as_posix(), preparedSha256=sha(source_file),
        currentContractSha256=sha(selected_file), currentSelectedFamilies=len(selected['families']),
        currentSelectedMembers=len(selected['sources']), newSourceCandidates=len(candidates), candidates=candidates,
        sourceVxlCount=sum(s['format'] == 'vxl' for s in target['sources']), terrainSelection=selected.get('selectedTerrain')))
receipt = dict(status='NEXT_THEATER_PREFLIGHT_ONLY_NO_RESOURCE_OR_COVERAGE_CHANGE',
    urbanContractSha256=sha(urban_file), results=results,
    policy='Exact SHA, full palette, logical metadata and all decoded frame hashes are source evidence, not user acceptance or complete-family selection. TMP production and theater-specific materials remain separate. Existing selected resources are unchanged.',
    windows='NOT_RUN', m24Complete=False)
file = base / 'next-theater-urban-candidates-after-batch62-v1.json'
with file.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps([dict(theater=r['theater'], sourceCandidates=r['newSourceCandidates'],
    batch62Pending=sum(c['donorBatch62VisualPending'] for c in r['candidates']),
    sourceVoxelFiles=r['sourceVxlCount']) for r in results]))
