"""Build metadata-only coverage from the ignored, read-only M0.4 inventory."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / '.artifacts/m0-4/inventory.json'
data = json.loads(RAW.read_text())
selected = [m for m in data['maps'] if m['name'] in ('all01t.map', 'sov01t.map')]

def source_ref(path):
    return {'path': path, 'sha256': hashlib.sha256((ROOT / path).read_bytes()).hexdigest()}

# Reviewed source findings, not claims of retail parity.
action_notes = {
    11: ('implemented', 'Dispatches label event; isolated dispatch probe passed.', 'Resolve mission labels and exercise HUD objective timing.'),
    12: ('implemented', 'Removes trigger by ID; source inspected.', 'Destroy a linked/repeating trigger and verify future evaluation stops.'),
    14: ('partial', 'Reads params[1] from action object; produces NaN. Also resolves countries, not campaign houses.', 'Correct argument shape and verify tagged ownership transfer.'),
    17: ('partial', 'Reveals around waypoint for all combatants; campaign recipient semantics unverified.', 'Check recipient house, radius and fog at map waypoint.'),
    19: ('unverified', 'Dispatches sound identifier; mission ID-to-audio mapping not validated.', 'Resolve indexed sound and verify playback once.'),
    21: ('unverified', 'Dispatches EVA identifier; campaign speech mapping not validated.', 'Resolve speech and verify order against objective.'),
    22: ('implemented', 'Forwards forceTrigger ID and game context; source inspected.', 'Force disabled/linked trigger and check repeat semantics.'),
    36: ('partial', 'Finds source by country name and destination by country ID/start location.', 'Use distinct campaign houses sharing one country.'),
    41: ('unverified', 'Looks up animation index and decoded waypoint; emits event.', 'Verify animation order, index table and waypoint decoding.'),
    53: ('implemented', 'Forwards ID and true flag; isolated probe passed.', 'Enable objective trigger then observe its own conditions.'),
    54: ('implemented', 'Forwards ID and false flag; source inspected.', 'Disable repeating trigger and verify no late event execution.'),
    55: ('partial', 'Converts radar enum by subtracting one and sends to all combatants.', 'Verify radar event identity and intended campaign recipient.'),
    56: ('implemented', 'Numeric local variable key matches MapFile initialization; set/read probe passed.', 'Set each objective variable independently and test joint gate.'),
    57: ('implemented', 'Same numeric key contract as local set; source inspected.', 'Clear after set and verify repeat/reset behavior.'),
    63: ('unverified', 'Detonates HE at parameter waypoint using 100 damage.', 'Verify map intent, bridge elevation and target scope against retail.'),
    99: ('unverified', 'Dispatches sound at action.params[6] waypoint.', 'Verify positional audio, index mapping and location.'),
    101: ('partial', 'Unreveals around waypoint for all combatants.', 'Verify recipient and already explored fog behavior.'),
    108: ('partial', 'Explicit powerup table includes undefined entries and random fallback for unknown IDs.', 'Verify requested crate type, spawn location and deterministic RNG.'),
    113: ('partial', 'House filter then only players[0] gets idle-infantry cheer tasks.', 'Check house -1/multiple matching houses and occupied units.'),
    116: ('unverified', 'Stops sounds at resolved waypoint via event.', 'Verify looping sound stops without stopping other locations.'),
}
event_notes = {
    1: ('partial', 'Filters cell/object entry targets and country ID; no campaign-house binding.', 'Enter tagged cell with correct/wrong house and air/ground unit.'),
    6: ('unverified', 'Filters attacks by enemy/non-incidental source against targets.', 'Compare direct, incidental and allied damage on tagged targets.'),
    9: ('partial', 'NaN house ID and reversed check arguments; direct manager-shaped call throws.', 'Repair signature, then destroy final land/air/naval unit.'),
    10: ('partial', 'Reads params[1] from event object; NaN reproduced.', 'Destroy final building for correct campaign house.'),
    11: ('partial', 'Same event-object parameter indexing defect; country-based owner match.', 'Destroy final asset and test delayed/reinforcement ownership.'),
    13: ('partial', 'Checks elapsedTicks++ > threshold; zero fires on second check, reset supported.', 'Verify first-fire tick and disabled/repeated timer behavior against retail.'),
    20: ('partial', 'BuildObjectTypeCondition reads event object as array; NaN reproduced.', 'Build requested vehicle; distinguish spawn/reinforcement and owner.'),
    21: ('partial', 'BuildObjectTypeCondition reads event object as array; NaN reproduced.', 'Train requested infantry; distinguish spawn/reinforcement and owner.'),
    30: ('partial', 'Finds country ID then queries power trait.', 'Verify exact house low-power transition and no-player behavior.'),
    32: ('partial', 'Building-index check exists, but player comes from trigger country-name lookup.', 'Bind campaign house and test existing target index.'),
    36: ('implemented', 'Numeric local variable read; joint set/read probe passed.', 'Require all four independent objectives; no premature success.'),
    44: ('partial', 'Checks attacker country ID and tagged target.', 'Attack same target from two houses sharing country.'),
    48: ('unverified', 'Matches tagged destruction/ownership-change/infiltration events.', 'Exercise each path plus unrelated targets and multiple tags.'),
    56: ('partial', 'Reads params[1] from event object; wrong house ID.', 'Destroy final land unit while naval unit remains.'),
    57: ('partial', 'Negated building check exists; unresolved trigger-house lookup can return false.', 'Remove each objective building index 131..134 under correct house.'),
}
requirements = []
for kind, plural, enum_name, notes, folder in [
    ('action', 'actions', 'TriggerActionType', action_notes, 'executor'),
    ('event', 'events', 'TriggerEventType', event_notes, 'condition'),
]:
    entries = {e['id']: e for e in data['factories'][kind]['entries']}
    for id_ in sorted({r['id'] for m in selected for r in m[plural]}):
        handler = entries.get(id_)
        references = []
        for m in selected:
            refs = [r for r in m[plural] if r['id'] == id_]
            if refs:
                references.append({'map': m['name'], 'section': plural.title(), 'occurrences': len(refs),
                    'entries': [f"{r['triggerId']}:{r['index']}" for r in refs]})
        status, evidence, validation = notes.get(id_, ('missing',
            'Absent from current enum and factory. Numeric opcode semantics remain unverified; preserve raw parameters in local evidence.',
            'Resolve original opcode semantics from primary data/documentation; replay every referenced parameter form and failure path.'))
        prereqs = ['campaign-house-binding', 'strict-preflight', 'trigger-lifecycle']
        if not handler: prereqs.append('opcode-semantics-and-handler')
        if kind == 'action' and id_ in [4, 5, 7, 80]: prereqs += ['team-lifecycle', 'task-force-instantiation', 'script-vm']
        if kind == 'action' and id_ in [1, 2]: prereqs += ['mission-result-policy']
        probed_ids = [11, 53, 56] if kind == 'action' else [9, 10, 13, 20, 21, 36]
        confidence = ('bounded-CPU-probe-and-source' if id_ in probed_ids
                      else 'source-only-no-retail-runtime-validation')
        requirements.append({'kind': kind, 'id': id_, 'name': handler['name'] if handler else None,
            'parseSupport': 'recognized-typed-record' if handler else 'warn-and-skip',
            'executionSupport': status, 'semanticConfidence': confidence,
            'evidence': evidence, 'prerequisites': prereqs, 'futureValidation': validation,
            'source': source_ref(f"src/game/trigger/{folder}/{handler['handler']}.ts") if handler else source_ref(f'src/data/map/trigger/{enum_name}.ts'),
            'mapReferences': references})
for opcode in sorted({r['opcode'] for m in selected for s in m['scripts'] for r in s['instructions']}):
    references = []
    for m in selected:
        steps = [f"{s['id']}:{r['index']}" for s in m['scripts']
                 for r in s['instructions'] if r['opcode'] == opcode]
        if steps:
            references.append({'map': m['name'], 'section': 'ScriptTypes', 'entries': steps})
    requirements.append({'kind': 'script-opcode', 'id': opcode, 'name': None,
        'parseSupport': 'generic-INI-retained; no retail typed script parser found', 'executionSupport': 'missing',
        'semanticConfidence': 'numeric-reference-only; original opcode meaning unverified',
        'evidence': 'No retail ScriptTypes/TeamTypes/TaskForces executor in src/game or src/data; bot missions are a different system.',
        'prerequisites': ['team-lifecycle', 'task-force-instantiation', 'script-vm', 'opcode-semantics-and-handler'],
        'futureValidation': 'Execute each referenced script step, wait/completion/branch/abort behavior with real team members and deterministic ticks.',
        'mapReferences': references})
structural = [
    ('campaign-house-binding', 'Houses', 'partial', 'GameFactory creates lobby countries; Game.createInitialMapTechnos skips non-neutral units.', 'Preserve House/Country/Player distinction, alliances, initial objects, tags and exact player control.'),
    ('team-lifecycle', 'TeamTypes', 'missing', 'Generic INI only; no typed team instance scheduler.', 'Recruit/create team, obey flags, owner, trigger, transport and completion lifecycle.'),
    ('task-force-instantiation', 'TaskForces', 'missing', 'Generic INI retains unit counts but no campaign instantiation.', 'Create exact unit composition with capacities and deterministic spawn failures.'),
    ('script-vm', 'ScriptTypes', 'missing', 'No per-team script program counter or task completion pipeline.', 'Execute sequential commands with wait, loop, cancellation and persistence.'),
    ('trigger-lifecycle', 'Triggers', 'partial', 'Tag associations and AND evaluation exist; difficulty flags are parsed but not applied in TriggerManager; linked-trigger semantics unverified.', 'Validate enabled flags, all difficulty settings, OnceAll/Repeat, attachments and forced execution.'),
    ('local-variables', 'VariableNames', 'implemented', 'Numeric local keys and bool initialization; scoped CPU set/read passes.', 'Load map defaults and preserve each variable independently across save/load.'),
    ('mission-result-policy', 'Actions', 'missing', 'Mission success/failure action IDs 1/2 skipped. Game.update uses skirmish defeat/end.', 'Complete original objective chain and independent mission failure chain, without elimination substitution.'),
]
for id_, section_, status, evidence, validation in structural:
    list_key = {'TeamTypes': 'teams', 'TaskForces': 'taskForces', 'ScriptTypes': 'scripts'}.get(section_)
    requirements.append({'kind': 'subsystem', 'id': id_, 'parseSupport': 'generic-INI or partial MapFile fields',
        'executionSupport': status, 'semanticConfidence': 'source-inspection; not a playable mission',
        'evidence': evidence, 'prerequisites': ['strict-preflight'], 'futureValidation': validation,
        'mapReferences': [{'map': m['name'], 'section': section_, 'count': m['counts'][section_],
            'entries': [t['id'] for t in m[list_key]] if list_key else []} for m in selected]})

def metadata(m):
    return {k: m[k] for k in ['name', 'source', 'memberId', 'bytes', 'sha256', 'occurrences', 'counts', 'missingActions', 'missingEvents']}

# Parse only catalog section/Scenario identifiers; never include display strings.
selection = {}
for filename in ['battle.ini', 'mapsel.ini']:
    active, values = None, {}
    for line in (ROOT / f'.artifacts/m0-4/{filename}.txt').read_text().splitlines():
        line = line.split(';', 1)[0].strip()
        if line.startswith('['): active = line.strip('[]').upper()
        elif '=' in line:
            key, value = map(str.strip, line.split('=', 1))
            if key.lower() == 'scenario' and re.fullmatch(r'(?:all|sov)\d\d[tsu]\.map', value, re.I): values[active] = value.lower()
    selection[filename] = values
assert len(set(selection['mapsel.ini'].values())) == 24
assert selection['battle.ini']['SOV09'] == selection['mapsel.ini']['SOV09'] == 'sov09u.map'
report = {'schemaVersion': 1, 'status': 'assessment-only-no-campaign-implementation',
    'checkedBaseline': data['sourceIdentity'], 'inventorySha256': hashlib.sha256(RAW.read_bytes()).hexdigest(),
    'method': {'candidateCount': len(data['maps']), 'candidateMeaning': 'Previously probed filenames, not exhaustive archive name enumeration or verified missions',
        'rawArityChecks': 'All 25 stored candidates: declared action/event counts and exact token consumption checked without dropping unknown IDs.',
        'oldInventoryUnchanged': True, 'factoryActions': len(data['factories']['action']['entries']), 'factoryEvents': len(data['factories']['event']['entries']),
        'supportedMeaning': 'Implemented means a handler path exists with inspected behavior; retail semantics and full mission remain unverified.',
        'scriptOpcodeNames': 'Unknown names intentionally null, not guessed from TS or Yuri opcode lists.'},
    'catalogs': [c for c in data['catalogs'] if not c.get('absentInAllowlistedTree')],
    'missionSelection': selection,
    'alternateMap': {'selected': 'sov09u.map', 'extraUnselectedCandidate': 'sov09t.map', 'extraStatus': 'Different content; no selection/progression/mission.ini entry found. Provenance and purpose unverified; do not present as mission 25.',
        'identities': [metadata(m) for m in data['maps'] if m['name'] in ('sov09t.map', 'sov09u.map')]},
    'candidates': [metadata(m) for m in selected],
    'teamLinks': [{'map': m['name'], 'links': [{'team': t['id'], 'script': t['properties'].get('Script'), 'taskForce': t['properties'].get('TaskForce')} for t in m['teams']]} for m in selected],
    'requirements': requirements,
    'crossMissionRequirements': [
        {'id': 'global-variables', 'status': 'partial', 'evidence': 'Not used as action 28/29 in selected first missions. GlobalVariableExecutor object/array bug reproduced; manager state is per Game. Campaign persistence absent.'},
        {'id': 'mission-timer', 'status': 'unverified', 'evidence': 'First missions use elapsed-time event 13, not countdown actions 23..27/event 14. Timer handlers/countdown exist; inheritance and save/load need separate verification.'},
        {'id': 'transitions', 'status': 'missing', 'evidence': 'Use verified mapsel.ini order; Basic NextScenario references GDI2A/GDI9C legacy names and is not a valid RA2 transition contract.'},
        {'id': 'save-load', 'status': 'missing', 'evidence': 'No full mission snapshot/restore path found. Need world, orders, teams, script PCs, triggers, variables, RNG, timers, objectives and campaign progress.'}],
    'locale': {'detected': data['locale']['locale'], 'labels': data['locale']['labels'], 'duplicates': data['locale']['duplicates'],
        'textActionCoverage': [{'map': r['name'], 'rawCaseSensitiveDistinctReferences': len(r['labels']), 'allFoundIgnoringCase': all(e['present'] for e in r['labels'])} for r in data['locale']['textCoverage']],
        'simplifiedChineseComplete': 'UNVERIFIED; current archive declares zh-TW', 'mediaComplete': 'UNVERIFIED; no movie import/playback'},
    'recommendation': {'mission': 'sov01t.map', 'readyNow': False,
        'reason': 'Explicit four-part building objective to local-variable conjunction and separate defeat path; fewer teams/scripts than Allied 01. Reinforcements, scripted behaviors and campaign-house binding remain substantial prerequisites.',
        'acceptance': 'Destroy the four objective building types through normal play, observe flags 1..4 and delayed mission-specific victory; separately exercise original failure path. Preserve scripts/objectives and all difficulty behavior.'}}
for m in selected:
    for t in m['teams']:
        assert t['properties']['Script'] in {s['id'] for s in m['scripts']}
        assert t['properties']['TaskForce'] in {s['id'] for s in m['taskForces']}
(ROOT / 'docs/campaign-support-matrix.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'requirements': len(requirements), 'selectedMaps': len(selected), 'catalogCampaignMissions': 24, 'teamReferencesResolve': True}))
