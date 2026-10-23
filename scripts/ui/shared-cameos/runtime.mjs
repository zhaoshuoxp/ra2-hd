// Focused real sidebar checks for both editions and both shared factions.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const delivery = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: false });
const bytes = await fs.readFile(path.join(delivery.uiRoot, `ui-packs/${delivery.uiRevision}/manifest.json`));
assert.equal(createHash('sha256').update(bytes).digest('hex'), delivery.uiManifestSha256);
const manifest = JSON.parse(bytes);
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { status: 'RUNNING', app: delivery.app, resources: delivery.resources, uiRoot: delivery.uiRoot,
    uiRevision: manifest.revision, uiEntries: manifest.assets.length, cases: [], errors: [],
    disclosure: 'Real matches with legal prerequisite fixtures and native veteran production grants. No technology, rule or camera overrides. Focused changed-item validation; all-house source audit is separate.' };
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app;
async function inspect(page, name, wait = true) {
    await page.evaluate(name => window.__ra2debug.helpers.getSidebarTechnoDebugStateByName(name), name);
    if (wait) await page.waitForFunction(name => {
        const d = window.__ra2debug, state = d.helpers.getSidebarTechnoDebugStateByName(name);
        const card = d.gameScreen.hud.sidebarCard, item = card.publishedItems?.[state.slotIndex]
            ?? card.props.sidebarModel.activeTab.items[state.itemIndex];
        const builder = card.slotObjects[state.slotIndex].builder;
        const current = card.props.sidebarModel.activeTab.items[state.itemIndex];
        return item?.target.rules.name === name && item.cameo === current?.cameo && builder.isHdActive
            && builder.frames[builder.native.getFrame()]?.id === item.cameo + '.shp';
    }, name, { timeout: 10000 });
    return page.evaluate(name => {
        const d = window.__ra2debug, state = d.helpers.getSidebarTechnoDebugStateByName(name);
        const card = d.gameScreen.hud.sidebarCard, slot = state.slotIndex;
        const item = card.publishedItems?.[slot] ?? card.props.sidebarModel.activeTab.items[state.itemIndex];
        const object = card.slotObjects[slot], b = object.builder;
        const frame = b.frames[b.native.getFrame()], entry = d.uiArt.manifest.assets.find(e => e.id === frame.id);
        const image = b.source.getImage(b.native.getFrame()), uv = b.overlay?.geometry.getAttribute('uv');
        const us = uv ? Array.from({ length: uv.count }, (_, i) => uv.getX(i)) : [];
        const vs = uv ? Array.from({ length: uv.count }, (_, i) => uv.getY(i)) : [];
        return { name, cameo: item.cameo + '.shp', entryId: frame.id, entry,
            hd: b.isHdActive, originalVisible: b.original.visible, light: b.light,
            textureSize: b.asset && [b.asset.bitmap.width, b.asset.bitmap.height],
            rankTexture: !!b.asset?.overlayTexture, frame: b.native.getFrame(),
            geometry: [frame.width, frame.height], aggregateCanvas: [state.width, state.height],
            nativeTrim: { x: image.x, y: image.y, width: image.width, height: image.height },
            hdPositions: b.overlay && Array.from(b.overlay.geometry.getAttribute('position').array),
            nativePositions: Array.from(b.original.geometry.getAttribute('position').array),
            uvBounds: uv && [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)],
            tab: state.tabId, slot,
            disabled: item.disabled, progress: item.progress, quantity: item.quantity, status: item.status,
            nameVisible: card.nameObjects[slot].getUiObject().get3DObject().visible,
            clockVisible: card.progressOverlays[slot].get3DObject().visible,
            quantityVisible: card.quantityObjects[slot].getUiObject().get3DObject().visible,
            gl: d.renderer.renderer.getContext().getError(), ui: d.uiArt.metrics() };
    }, name);
}

function checkBinding(binding) {
    assert.equal(binding.entryId, binding.cameo, binding.name);
    assert(binding.hd && !binding.originalVisible, binding.name);
    assert.deepEqual(binding.textureSize, [240, 192]); assert.deepEqual(binding.geometry, [60, 48]);
    assert.deepEqual(binding.hdPositions, binding.nativePositions, `Native geometry changed: ${binding.name}`);
    const trim = binding.nativeTrim;
    const expectedUv = [trim.x / 60, (trim.x + trim.width) / 60,
        1 - (trim.y + trim.height) / 48, 1 - trim.y / 48];
    assert(binding.uvBounds.every((value, index) => Math.abs(value - expectedUv[index]) < 1e-6),
        `Native UV crop changed: ${binding.name}`);
    assert.deepEqual(binding.entry, manifest.assets.find(e => e.id === binding.cameo));
    assert(binding.nameVisible, `Dynamic name missing: ${binding.name}`);
    assert.equal(binding.gl, 0); assert(binding.ui.reservedBytes <= 16 * 1024 * 1024);
}

try {
    const cases = [
        { key: 'yr-allied', edition: 'yr', country: 0, checks: ['GGI','BFRT','GAROBO','ROBO','ORCA'], ranks: ['GGI','BFRT','ORCA'], powers: ['ForceShieldSpecial'] },
        { key: 'yr-soviet', edition: 'yr', country: 5, checks: ['NABNKR','BORIS','NAINDP','SCHP'], ranks: ['BORIS','SCHP'], powers: ['SpyPlaneSpecial','ForceShieldSpecial'] },
        { key: 'ra2-allied', edition: 'ra2', country: 0, checks: ['GAPOWR','E1','MTNK','ORCA'], ranks: ['ORCA'], powers: [] },
        { key: 'ra2-soviet', edition: 'ra2', country: 5, checks: ['NAPOWR','E2','HTNK'], ranks: ['E2'], powers: [] },
    ];
    const only = process.argv.find(a => a.startsWith('--cases='))?.slice(8).split(',');
    for (const spec of cases.filter(c => !only || only.includes(c.key))) {
        const { key, edition, country, checks, ranks, powers } = spec;
        const out = path.join(output, key), profile = path.join(out, 'profile');
        await fs.mkdir(profile, { recursive: true });
        await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: delivery.resources }));
        app = await electron.launch({ executablePath: path.join(delivery.app, 'Contents/MacOS/RA2 HD Editions'),
            cwd: '/private/tmp', timeout: 60000, env: { ...process.env, RA2_DESKTOP_USER_DATA: profile,
                RA2_DESKTOP_NO_DISCOVERY: '1', RA2_UI_RESOURCE_ROOT: delivery.uiRoot, TMPDIR: out } });
        const page = await app.firstWindow();
        const result = { ...spec, status: 'RUNNING', bindings: [], alternates: [], powers: [] };
        report.cases.push(result);
        page.on('pageerror', error => report.errors.push({ key, error: error.stack }));
        await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
        await page.waitForFunction(revision => window.__ra2debug?.uiArt?.revision === revision, manifest.revision, { timeout: 90000 });
        assert.deepEqual(await page.evaluate(() => window.__ra2debug.uiArt.manifest), manifest);
        assert(await app.evaluate(({ app }) => app.isPackaged));
        await page.evaluate(({ edition, country }) => {
            const d = window.__ra2debug;
            d.generalOptions.graphics.hdEnabled.value = true;
            d.generalOptions.graphics.renderResolution.value = '1080p';
            const prefs = { _r_lastMap: (edition === 'yr' ? 'X' : '') + 'MP01T4.map', _r_lastMode: '1',
                _r_lastCountry: String(country), _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
                _r_lastBots: JSON.stringify([null,null,null,{ d:4,c:country===5?0:5,co:2,s:3,t:1 },null,null,null,null]) };
            for (const [key,value] of Object.entries(prefs)) localStorage.setItem(`_edition:${edition}:${key}`,value);
        }, { edition, country });
        await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
        await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
        await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const bot of d.game.botManager.bots.values()) bot.onGameTick = () => {};
            const mcv = d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name));
            if (!mcv) throw Error('No native construction vehicle');
            d.actionsApi.orderUnits([mcv.id],10);
        });
        await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.rules.constructionYard && u.buildStatus===1));
        result.fixtures = await page.evaluate(({ edition,country }) => {
            const d = window.__ra2debug,g=d.game,p=d.localPlayer;
            const base=p.getOwnedObjects().find(u=>u.rules.constructionYard);
            g.mapShroudTrait.revealMap(p,g);
            const worker=g.getConstructionWorker(p), placed=[];
            const tiles=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t)).sort((a,b)=>
                Math.hypot(a.rx-base.tile.rx,a.ry-base.tile.ry)-Math.hypot(b.rx-base.tile.rx,b.ry-base.tile.ry));
            const names=country===0 ? ['GAPOWR','GAPILE','GAREFN','GAWEAP','GAAIRC','GATECH',
                ...(edition==='yr'?['GAROBO']:[]),...Array(6).fill('GAPOWR')]
                : ['NAPOWR','NAHAND','NAREFN','NAWEAP','NARADR','NATECH',...Array(6).fill('NAPOWR')];
            for(const name of names) {
                const tile=tiles.find(t=>worker.canPlaceAt(name,t,{ignoreAdjacent:true,normalizedTile:true}));
                if(!tile)throw Error('No legal foundation: '+name);
                placed.push(...worker.placeAt(name,tile,true).map(u=>({name,id:u.id})));
            }
            window.__sharedCameoFixtures=placed;return placed;
        },{edition,country});
        await page.waitForFunction(()=>window.__sharedCameoFixtures.every(f=>window.__ra2debug.localPlayer.getOwnedObjects().find(u=>u.id===f.id)?.buildStatus===1),undefined,{timeout:30000});
        await page.evaluate(()=>{const d=window.__ra2debug;d.gameScreen.hud.sidebarCard.props.sidebarModel.updateAvailableObjects(d.game.art);});
        result.available=await page.evaluate(()=>window.__ra2debug.localPlayer.production.getAvailableObjects().map(r=>r.name));
        assert(checks.every(n=>result.available.includes(n)), 'Unavailable: '+checks.filter(n=>!result.available.includes(n)));
        for(const name of checks) {
            const b=await inspect(page,name);checkBinding(b);result.bindings.push(b);
            await page.screenshot({path:path.join(out,name+'-normal.png')});
        }
        for(const name of powers) {
            const b=await inspect(page,name);checkBinding(b);result.powers.push(b);
            await page.screenshot({path:path.join(out,name+'.png')});
        }
        await page.evaluate(()=>{
            const d=window.__ra2debug,p=d.localPlayer;
            for(const unit of p.getOwnedObjects())if(unit.factoryTrait)p.production.addVeteranType(unit.factoryTrait.type);
            d.gameScreen.hud.sidebarCard.props.sidebarModel.updateAvailableObjects(d.game.art);
        });
        for(const name of ranks) {
            const b=await inspect(page,name);checkBinding(b);assert(b.rankTexture,name+' veteran overlay');
            if(name==='ORCA')assert.equal(b.cameo,'falcuico.shp');
            result.alternates.push(b);await page.screenshot({path:path.join(out,name+'-veteran.png')});
        }
        result.rapidSwitch = await page.evaluate(async () => {
            const d=window.__ra2debug,c=d.gameScreen.hud.sidebarCard,m=c.props.sidebarModel,samples=[];
            for(let i=0;i<16;i++) {
                m.selectTab(i%4);c.scrollToOffset(0);c.updateSlots(m.activeTab.items,c.props.slots);
                await new Promise(requestAnimationFrame);
                samples.push({tab:i%4,ui:d.uiArt.metrics(),visible:c.slotObjects.flatMap((o,slot)=>o.get3DObject().visible
                    ? [{hd:o.builder.isHdActive,id:o.builder.frames[o.builder.native.getFrame()]?.id,
                        expected:c.publishedItems?.[slot]?.cameo+'.shp'}] : [])});
            }
            return samples;
        });
        assert(result.rapidSwitch.every(s=>s.ui.reservedBytes<=16*1024*1024));
        assert(result.rapidSwitch.every(s=>s.visible.every(v=>v.id===v.expected&&
            (!manifest.assets.some(a=>a.id===v.id)||v.hd))), 'Rapid tab changes must retain coherent HD publication');
        const target=ranks[0];
        await page.evaluate(()=>{window.__ra2debug.generalOptions.graphics.hdEnabled.value=false;});
        await page.waitForFunction(()=>window.__ra2debug.uiArt.metrics().reservedBytes===0);
        result.original=await inspect(page,target,false);assert(!result.original.hd&&result.original.originalVisible);
        if(target==='ORCA')assert.equal(result.original.entryId,'falcuico.shp');
        await page.screenshot({path:path.join(out,'original-fallback.png')});
        await page.evaluate(()=>{window.__ra2debug.generalOptions.graphics.hdEnabled.value=true;});
        result.restored=await inspect(page,target);checkBinding(result.restored);
        result.peakUiBytes=Math.max(...[...result.bindings,...result.alternates,...result.powers,result.restored,...result.rapidSwitch].map(b=>b.ui.reservedBytes));
        result.status='PASS_NATIVE_CAMEOS_RANKS_POWERS_AND_HD_OFF_ON';
        console.log(key,result.status,result.peakUiBytes);await save();await app.close();app=undefined;
    }
    assert.deepEqual(report.errors,[]);report.status='PASS_NATIVE_SHARED_CAMEO_CASES';
} catch(error) {
    report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error);
} finally {
    if(app)await app.close();await save();console.log(report.status);
}
