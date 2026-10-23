// Test-only adapter: retain the accepted experiment as an independent reference.
export function installProductionComparison() {
    const d = window.__ra2debug, experiment = window.__m14Edge;
    const renderWithExperiment = d.renderer.render;
    let mode = 'C';
    function apply() {
        d.worldScene.meshBatchManager.get3DObject().traverse(object => {
            if (object.verticesPerItem && object.material?.uniforms.hdFiltering)
                object.material.uniforms.hdFiltering.value = mode === 'C';
        });
    }
    d.renderer.render = function(...args) { apply(); return renderWithExperiment.apply(this, args); };
    window.__m14Edge = {
        setMode(value) {
            if (!['A', 'B', 'C'].includes(value)) throw Error('Unknown production comparison mode');
            experiment.setMode(value === 'B' ? 'C' : 'A'); mode = value; apply();
        },
        info() {
            const result = experiment.info(); let count = 0;
            d.worldScene.meshBatchManager.get3DObject().traverseVisible(o => { if (o.name === 'hd-sprite-edge') count++; });
            return { ...result, mode, visibleEdgeMeshes: mode === 'C' ? count : result.visibleEdgeMeshes };
        },
        dispose() {
            mode = 'C'; apply(); d.renderer.render = renderWithExperiment;
            experiment.dispose();
        },
    };
}
