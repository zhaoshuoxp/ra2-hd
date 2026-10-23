// Controlled native animation-clock evidence; not a natural gameplay claim.
import path from 'node:path';

export async function captureMechanisms(page, output) {
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    const fixtures = await page.evaluate(() => window.__alliedFixtures);
    const states = {
        GACSPH: ['BUILDUP', 'SUPER_CHARGE_START', 'SUPER_CHARGE_LOOP', 'SUPER_CHARGE_END'],
        GAWEAT: ['BUILDUP', 'SUPER_CHARGE_START', 'SUPER_CHARGE_LOOP', 'SUPER_CHARGE_END'],
        GADEPT: ['BUILDUP', 'SPECIAL_REPAIR_START', 'SPECIAL_REPAIR_LOOP', 'SPECIAL_REPAIR_END'],
        GAREFN: ['BUILDUP', 'SPECIAL_DOCKING'],
        GACNST: ['BUILDUP', 'PRODUCTION'],
        GAWEAP: ['BUILDUP', 'FACTORY_DEPLOYING', 'FACTORY_ROOF_DEPLOYING'],
        GAYARD: ['BUILDUP', 'PRODUCTION', 'SPECIAL_REPAIR_START', 'SPECIAL_REPAIR_LOOP', 'SPECIAL_REPAIR_END'],
    };
    const evidence = [];
    for (const fixture of fixtures) {
        for (const state of states[fixture.name] ?? ['BUILDUP']) {
            for (const fraction of [0, .33, .66, 1]) {
                const sample = await page.evaluate(async ({ fixture, state, fraction }) => {
                    const { AnimationType } = await import('/src/engine/renderable/entity/building/AnimationType.ts');
                    const d = window.__ra2debug;
                    const unit = d.localPlayer.getOwnedObjects().find(u => u.id === fixture.id);
                    const r = d.renderableManager.getRenderableByGameObject(unit);
                    const type = AnimationType[state];
                    if (!r.hasAnimation(type)) throw Error(`${fixture.name} lacks ${state}`);
                    r.setAnimation(type, 0);
                    const [kind, index] = r.getNormalizedAnimType(type);
                    const list = r.animObjects.get(kind);
                    const selected = index === undefined || state.startsWith('FACTORY_')
                        ? list : [list[Math.min(index, list.length - 1)]];
                    const frames = selected.map(object => {
                        const animation = r.animations.get(object), props = animation.props;
                        const frame = props.start + Math.round((props.loopEnd - props.start) * fraction);
                        animation.start(0);
                        animation.update((frame - props.start) / (props.rate * animation.speed.value) * 1000 + 1);
                        object.setFrame(animation.getCurrentFrame());
                        const materials = [];
                        object.get3DObject().traverse(o => { if (o.isMesh) materials.push(o.material?.type); });
                        return { target: frame, sourceFrameCount: props.frameCount,
                            animation: animation.getCurrentFrame(), builder: object.builder.getFrame(),
                            visible: object.get3DObject().visible, materials };
                    });
                    // A stopped loop does not rebuild instancing batches.
                    // Refresh the real world batches after the native frame
                    // setters without re-running gameplay state selection.
                    for (const scene of d.renderer.getScenes()) {
                        scene.scene.updateMatrixWorld(false);
                        scene.meshBatchManager?.updateMeshes();
                    }
                    d.renderer.render();
                    return { name: fixture.name, state, fraction, frames,
                        identity: r.imageFinder.getBuildingHdOverride(fixture.name, r.aggregatedImageData)?.identity,
                        bodyVisible: r.mainObj.get3DObject().visible };
                }, { fixture, state, fraction });
                if (!sample.identity || sample.frames.some(f => f.target >= f.sourceFrameCount
                    || f.target !== f.animation || f.animation !== f.builder
                    || !f.visible || !f.materials.includes('HdSpriteMaterial'))) throw Error(`Invalid native HD mechanism: ${JSON.stringify(sample)}`);
                const file = `${fixture.name}-${state}-${Math.round(fraction * 100)}.png`;
                await page.screenshot({ path: path.join(output, file) });
                evidence.push({ ...sample, screenshot: file });
            }
        }
        await page.evaluate(async id => {
            const d = window.__ra2debug;
            const unit = d.localPlayer.getOwnedObjects().find(u => u.id === id);
            d.renderableManager.getRenderableByGameObject(unit).setAnimation(0, 0);
        }, fixture.id);
    }
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    return { boundary: 'Controlled native animation clock and actual HD renderables; natural action execution not asserted', samples: evidence };
}
