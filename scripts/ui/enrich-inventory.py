"""Attach UI treatment and route plans without confusing inventory with completion."""
import json
from pathlib import Path
root=Path('.artifacts/menu-ui')
p=root/'inventory-v1/inventory.json'; x=json.loads(p.read_text())
for item in x['ui']:
    refs=' '.join(item['references']);name=item['member']
    screen='gameplay HUD' if '/hud/' in refs or '/Hud.ts' in refs else 'loading' if 'loadingScreen' in refs else 'main menu / setup / dialogs' if 'mainMenu' in refs else 'shared / legacy references'
    item.update(screenUsage=screen, interactionStates='Retain all native SHP frame states and animation timing; map interactions from the referenced widget.',
      localization='Live locale strings; baked labels require removal from authored art and live replacement. Palette files contain no text.',
      dependencies='Referenced palette plus original SHP canvas/frame offsets; duplicate archive variants are distinct faction assets.',
      proposedHdRoute='UI-specific immutable RGBA asset or deterministic scalable widget; no world remap shader.',
      activeHdRoute='NONE; Original retained unless explicitly listed in the current reviewed manifest.',
      fallback='Original source and entire native state group', acceptance='PRESERVATION_BASELINE' if 'mouse' in name else 'INVENTORIED_NOT_AUTHORED')
x['scalableWidgets']=[
 dict(group='text/font',sources=['src/gui/component/UiText.tsx','public/res/fonts/fonts.css','public/res/locale/zh-CN.json'],treatment='Live glyphs at output density, fallback system CJK glyphs; no generated text',status='PRESERVE'),
 dict(group='buttons and focus',sources=['src/gui/component/MenuButton.tsx','public/css/main-legacy.css'],treatment='Native semantic buttons; shared CSS bevel, normal/hover/pressed/disabled/focus',status='DIRECTION_PENDING'),
 dict(group='progress, quantity, selected outline',sources=['src/gui/screen/game/component/hud/SidebarCard.ts'],treatment='Native clock frames, live quantities, scalable outline retained above RGB cameo',status='REGRESSION_PRESERVE'),
 dict(group='dynamic compositing',sources=['src/gui/screen/game/component/Hud.ts','src/gui/screen/game/loadingScreen/LoadingScreen.tsx'],treatment='Radar/world state and live progress remain dynamic; backgrounds do not contain controls',status='PRESERVE'),
]
runtime=root/'runtime-v2/runtime-roster.json'
if runtime.exists():
    rows=json.loads(runtime.read_text()); keyed={r['id']:r for r in rows}
    x['runtimeCrosscheck']=dict(runtimeObjects=len(rows),sourceObjects=len(x['roster']),
      changedCameos=[dict(id=r['id'],source=[r['cameo'],r['alternate']],runtime=[keyed[r['id']]['cameo'],keyed[r['id']]['alternate']]) for r in x['roster'] if r['id'] in keyed and (r['cameo']!=keyed[r['id']]['cameo'] or r['alternate']!=keyed[r['id']]['alternate'])],
      sourceOnly=[r['id'] for r in x['roster'] if r['id'] not in keyed])
(root/'inventory-complete.json').write_text(json.dumps(x,indent=2)+'\n')
print(json.dumps(x.get('runtimeCrosscheck',{})))
