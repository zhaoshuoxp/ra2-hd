"""Build edition-specific text layers without changing imported CSFs or maps."""
import hashlib
import json
import subprocess
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / '.artifacts/m2-4/retail-presentation-v1'
LOCALE = ROOT / 'public/res/locale'
INSTALL = ROOT.parent / 'Resource/Command and Conquer Red Alert II'

def load(path):
    return json.loads(path.read_text())

def lower(data):
    return {key.lower(): value for key, value in data.items()}

def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def save_ui(path, data):
    original = path.read_bytes().decode()
    pending = dict(data)
    lines = original.splitlines(keepends=True)
    for index, line in enumerate(lines):
        match = re.match(r'\s*"([^"]+)"\s*:', line)
        if match and match[1].lower() in pending:
            value = pending.pop(match[1].lower())
            if json.loads('{' + line.strip().rstrip(',') + '}')[match[1]] != value:
                suffix = ',\n' if line.rstrip().endswith(',') else '\n'
                lines[index] = '    ' + json.dumps(match[1]) + ': ' + json.dumps(value, ensure_ascii=False) + suffix
    if pending:
        end = next(i for i in range(len(lines) - 1, -1, -1) if lines[i].strip() == '}')
        previous = next(i for i in range(end - 1, -1, -1) if lines[i].strip())
        if not lines[previous].rstrip().endswith(','):
            lines[previous] = lines[previous].rstrip() + ',\n'
        lines[end:end] = ['    ' + json.dumps(key) + ': ' + json.dumps(value, ensure_ascii=False)
                          + (',\n' if i < len(pending) - 1 else '\n')
                          for i, (key, value) in enumerate(pending.items())]
    path.write_bytes(''.join(lines).encode())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

english = {row['label'].lower(): row['value'] for row in load(AUDIT / 'english-original.json')['content']}
english['stt:keyboardlabelerror'] = 'Displays key reassignment errors.'
assert len(english) == 5211 and not any('\u3400' <= c <= '\u9fff' for v in english.values() for c in v)
audit = load(AUDIT / 'audit.json')
ui_en = lower(load(LOCALE / 'en-US.json'))
ui_cn = lower(load(LOCALE / 'zh-CN.json'))
ui_en.update({'hd:traditionalchinese': 'Chinese (Traditional)', 'hd:playername': 'Player name',
    'hd:interfacelanguage': 'Game language', 'hd:languagenextmenu': 'Applies when returning to the main menu. The current match continues.',
    'ts:sortnone': 'Original order', 'hd:joystick': 'Joystick'})
ui_en.update({'hd:menuedition': 'Switch game', 'hd:menucampaign': 'Campaign', 'hd:menuskirmish': 'Skirmish',
    'hd:menulan': 'Local network', 'hd:menumovies': 'Movies', 'hd:menuoptions': 'Options', 'hd:menuexit': 'Exit game',
    'hd:menuunavailable': 'Not available yet', 'hd:menuskirmishhint': 'Play a skirmish against local computer opponents',
    'hd:menubrowserexit': 'Close this tab or window to exit the browser preview.',
    'ts:gameres_download_desc': 'Game resources are available from the project community.',
    'ts:gameres_download_hint': 'Keep a complete copy of the game resources on this computer.',
    'wol:matchjoininggame': 'Joining game...', 'wol:matchwaitingforplayers': 'Waiting for players...',
    'gui:okay': 'OK', 'gui:almostready': 'Almost ready...',
    **{f'name:{name}': value for names, value in [(['garefn', 'narefn'], 'Ore Refinery'),
        (['gacnst', 'nacnst'], 'Construction Yard'), (['gapile', 'nahand'], 'Barracks'),
        (['gadept', 'nadept'], 'Service Depot'), (['gatech', 'natech'], 'Battle Lab'),
        (['gaweap', 'naweap'], 'War Factory'), (['gawall', 'nawall'], 'Wall'),
        (['gayard', 'nayard'], 'Naval Shipyard'), (['amcv', 'smcv'], 'MCV')] for name in names}})
ui_en.update({'hd:fullscreenexiterror': 'Unable to leave full screen',
    'hd:fullscreenentererror': 'Unable to enter full screen. Check browser permissions.',
    'hd:missionaccomplished': 'Mission Accomplished', 'hd:missionfailed': 'Mission Failed',
    'hd:chooseedition': 'Choose your game', 'hd:editionra2': 'Red Alert 2', 'hd:editionyr': "Yuri's Revenge",
    'hd:originalgame': 'Original game', 'hd:expansion': 'Expansion'})
ui_cn.update({'hd:traditionalchinese': '繁体中文', 'hd:playername': '玩家名称',
    'hd:interfacelanguage': '游戏语言', 'hd:languagenextmenu': '返回主菜单后应用语言；当前对局继续进行。',
    'ts:sortnone': '原版顺序', 'hd:joystick': '摇杆'})
ui_cn.update({'hd:fullscreenexiterror': '无法退出全屏模式',
    'hd:fullscreenentererror': '无法进入全屏模式，请检查浏览器权限设置。',
    'hd:missionaccomplished': '任务完成', 'hd:missionfailed': '任务失败',
    'hd:chooseedition': '选择游戏版本', 'hd:editionra2': '红色警戒 2', 'hd:editionyr': '尤里的复仇',
    'hd:originalgame': '原版游戏', 'hd:expansion': '资料片'})
ui_cn.update({'ts:playerassetssplit': '%s 的单位和资源已分配给剩余盟友。',
    'gui:mainmenu': '主菜单', 'gui:skirmishscore': '遭遇战结果', 'gui:continue': '继续', 'gui:player': '玩家',
    'gui:country': '国家', 'gui:color': '颜色', 'gui:score': '得分', 'gui:kills': '击杀', 'gui:losses': '损失',
    'gui:time': '时间', 'gui:map': '地图'})
# Preserve the pre-existing UI keys, including accepted factionless HUD names.
save_ui(LOCALE / 'en-US.json', ui_en)
save_ui(LOCALE / 'zh-CN.json', ui_cn)
subprocess.run(['swift', str(ROOT / 'scripts/m2-4/convert-traditional-ui.swift'),
                str(LOCALE / 'zh-CN.json'), str(LOCALE / 'zh-TW.json')], check=True)
ui_tw = load(LOCALE / 'zh-TW.json')
ui_tw.update({'hd:chinese': '简体中文', 'hd:traditionalchinese': '繁體中文', 'hd:playername': '玩家名稱',
              'hd:interfacelanguage': '遊戲語言', 'ts:sortnone': '原版順序'})
save(LOCALE / 'zh-TW.json', ui_tw)

outputs = []
for record in audit['records']:
    edition = record['edition']
    traditional = lower(load(AUDIT / record['csfs'][0]['saved']))
    simplified = lower(load(AUDIT / f'install-{edition}-zh-CN.json'))
    translated = {key: english.get(key, '') for key in traditional}
    if edition == 'ra2':
        translated['txt_devense_tab_desc'] = english['txt_defense_tab_desc']
        # YR's reference table shares the base labels. Restore edition identity.
        yr_traditional = lower(load(AUDIT / 'yr-0.json'))
        for key, value in traditional.items():
            if ('紅色警戒' in value or 'Red Alert 2' in value) and '尤里' in yr_traditional.get(key, ''):
                translated[key] = translated[key].replace("Yuri's Revenge", 'Red Alert 2')
        translated['txt_copyright'] = '© 2000 Electronic Arts, All Rights Reserved'
    assert set(traditional) == set(simplified)
    assert all(translated.values()) or all(value or not traditional[key] for key, value in translated.items())
    csf = record['csfs'][0]
    for language, labels in [('en-US', translated), ('zh-CN', simplified), ('zh-TW', traditional)]:
        file = LOCALE / f'retail-{edition}-{language}.json'
        save(file, {'schema': 'edition-retail-text-v1', 'edition': edition, 'language': language,
            'retailSource': {key: csf[key] for key in ['name', 'archive', 'sha256', 'bytes']}, 'labels': labels})
        outputs.append({'path': str(file.relative_to(ROOT)), 'sha256': sha(file), 'labels': len(labels)})
sources = [{'path': str(INSTALL / 'Resources/Translations/zh-Hans' / name),
            'sha256': sha(INSTALL / 'Resources/Translations/zh-Hans' / name)} for name in ['ra2.csf', 'ra2md.csf']]
sources.append({'url': 'https://github.com/3652xxyy/rynderack-project-translation/blob/40cefe0c900dc4bf1782a7b31a9b7111eb0caaa9/jsons/original.json',
    'sha256': sha(AUDIT / 'english-original.json'), 'labels': 5211,
    'policy': 'Original label table only; no mission-pack overrides, rules, or assets imported.'})
save(ROOT / 'docs/m2-4-retail-locales-20261021.json', {'schema': 'retail-localization-provenance-v1',
    'sources': sources, 'originalTraditionalSources': [r['csfs'][0] for r in audit['records']],
    'uiTraditional': 'Foundation ICU conversion of the existing Simplified Chinese UI, with reviewed language labels.',
    'outputs': outputs, 'sourceMutation': False})
print(json.dumps({'status': 'BUILT', 'outputs': outputs}, indent=2))
