"""Compile reusable source identities and complete SHP dependency families."""
import hashlib
import json
from pathlib import Path

prepared = Path('.artifacts/m2-2/prepared-native-v2/source.json')
source = json.loads(prepared.read_text())
ledger = json.loads(Path('docs/m2-2-map-coverage.json').read_text())
sources = {}
for entry in source['sources']:
    if entry['format'] != 'shp':
        continue
    sources[entry['member']] = dict(sha256=entry['sha256'], canvas=entry['canvas'],
        totalFrames=len(entry['frames']), bodyFrames=len(entry['frames']) // 2
        if entry.get('hasShadow') else len(entry['frames']), palette=entry['palette'],
        hasShadow=bool(entry.get('hasShadow')), remapable=bool(entry.get('remapable')))
    if sources[entry['member']]['bodyFrames'] >= 4 and any(
            binding['kind'] == 'building' and binding['role'] == 'body'
            for binding in entry['bindings']):
        palette = prepared.parent / 'native/isotem.pal'
        sources[entry['member']]['framePalettes'] = {'3': dict(member='isotem.pal',
            sha256=hashlib.sha256(palette.read_bytes()).hexdigest(), remapable=False,
            role='rubble', runtimeUsed=entry['nativeRules'].get('LeaveRubble', '').lower()
            in ['yes', 'true', '1'])}

families, identities, aliases = {}, {}, {}
for row in ledger['rows']:
    if row['decision'] != 'MISSING_HD_TO_PRODUCE' or row['kind'] in ['tmp', 'vehicle']:
        continue
    if not any(row['usage'].get(name) for name in ['XMP03T4.map', 'MP03T4.map']):
        continue
    member = row['source']['member']
    if member not in sources:
        matches = [name for name, native in sources.items() if native['sha256'] == row['source']['sha256']]
        if not matches:
            assert not any(row['usage'].get(name, {}).get('count') for name in ['XMP03T4.map', 'MP03T4.map']), member
            continue
        assert len(matches) == 1, f'Unresolved prepared source alias: {member}'
        canonical = matches[0]
        aliases[member] = canonical
        identities.setdefault(row['edition'], {})[row['id']] = ('environment-ore'
            if canonical.startswith('tib') and row['kind'] == 'overlay' else 'environment-' + canonical.split('.')[0])
        continue
    family = ('environment-ore' if member.startswith('tib') and row['kind'] == 'overlay' else
              'environment-gem' if member.startswith('gem') and row['kind'] == 'overlay' else
              'environment-lobrdb' if member.startswith('lobrdb') else
              'environment-lobrdg' if member.startswith('lobrdg') else
              'environment-' + member.split('.')[0])
    entry = families.setdefault(family, dict(members=set(), identities=set(), editions=set(), kinds=set()))
    entry['members'].add(member)
    for dependency in row.get('dependencies', []):
        if dependency.get('source', {}).get('member') in sources:
            entry['members'].add(dependency['source']['member'])
    entry['identities'].add(row['id'])
    entry['editions'].add(row['edition'])
    entry['kinds'].add(row['kind'])
    identities.setdefault(row['edition'], {})[row['id']] = family

for family, entry in families.items():
    for key in entry:
        entry[key] = sorted(entry[key])
    entry['familyHash'] = hashlib.sha256(json.dumps(dict(theater='TEMPERATE',
        members={name: sources[name] for name in entry['members']}, identities=entry['identities']),
        separators=(',', ':'), sort_keys=True).encode()).hexdigest()
used = {member for entry in families.values() for member in entry['members']}
assert used == set(sources), sorted(set(sources) - used)
destination = Path('desktop/environment-hd-contract.json')
previous = json.loads(destination.read_text()) if destination.exists() else {}
source_hash = hashlib.sha256(prepared.read_bytes()).hexdigest()
assert not previous or previous['preparedSourceSha256'] == source_hash, 'Changed native input requires an explicit contract revision'
selected = previous.get('selectedPack')
vxl = previous.get('vxl', {})
result = dict(schema='environment-shp-source-contract-v1', theater='TEMPERATE',
              preparedSourceSha256=source_hash,
              sources=sources, families=families, identities=identities, aliases=aliases,
              selectedPack=selected, vxl=vxl)
destination.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(families=len(families), sources=len(sources),
    identities={edition: len(rows) for edition, rows in identities.items()}, selectedPack=selected)))
