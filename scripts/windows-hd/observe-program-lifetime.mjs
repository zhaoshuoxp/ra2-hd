// Read-only material lifetime tracing for native scene-loading diagnostics.
export async function observeProgramLifetime(page) {
    await page.evaluate(() => {
        const d = window.__ra2debug, campaign = d.mainMenuController.screens.get(22);
        const gameScreen = campaign.rootController.screens.get(1);
        const gl = (d.renderer ?? gameScreen.renderer).renderer, compile = gl.compileAsync;
        const trace = window.__programLifetime = [], compiledMaterials = new Map();
        gl.compileAsync = async function(scene, camera, target) {
            const materials = new Map();
            scene.traverse(object => {
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                    if (!material) continue;
                    const item = materials.get(material) ?? { uuid: material.uuid, type: material.type,
                        name: material.name, objects: [], disposals: [] };
                    item.objects.push({ name: object.name, type: object.type }); materials.set(material, item);
                    compiledMaterials.set(material.uuid, material);
                }
            });
            const row = { scene: scene.name, started: performance.now(), materials: [...materials.values()] };
            trace.push(row);
            const listeners = [...materials].map(([material, item]) => {
                const listener = () => item.disposals.push({ time: performance.now(), stack: new Error('Material disposed during compilation').stack });
                material.addEventListener('dispose', listener); return [material, listener];
            });
            try { return await compile.call(this, scene, camera, target); }
            finally {
                row.finished = performance.now();
                listeners.forEach(([material, listener]) => material.removeEventListener('dispose', listener));
            }
        };
        window.addEventListener('error', () => {
            for (const row of trace.filter(row => !row.finished)) for (const item of row.materials) {
                item.programPresentAtError = gl.properties.get(compiledMaterials.get(item.uuid))?.currentProgram !== undefined;
            }
        });
    });
}
