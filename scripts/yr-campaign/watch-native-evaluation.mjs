import fs from 'node:fs/promises';
import path from 'node:path';

// Enable the debugger before a suspect synchronous evaluation begins. This
// observer never edits simulation state or accepts an interrupted world.
export async function watchNativeEvaluation(session, out, report) {
    const { page, app } = session, protocol = await page.context().newCDPSession(page);
    const scripts = new Map();
    protocol.on('Debugger.scriptParsed', event => scripts.set(event.scriptId, event.url));
    await protocol.send('Debugger.enable');
    const evaluate = page.evaluate.bind(page);
    let captured = false;
    const bounded = (promise, ms) => Promise.race([promise,
        new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Debugger observation timed out')), ms); timer.unref(); })]);
    page.evaluate = async (expression, argument) => {
        if (captured) return evaluate(expression, argument);
        let timer;
        const deadline = new Promise((_, reject) => {
            timer = setTimeout(async () => {
                captured = true;
                const observation = { status: 'STALLED_ISOLATED_EVALUATION_INTERRUPTED_FOR_INSPECTION',
                    expression: String(expression).slice(0, 400),
                    qualification: 'Read-only debugger inspection; the interrupted world is excluded from acceptance and save evidence.' };
                try {
                    const stopped = new Promise(resolve => protocol.once('Debugger.paused', resolve));
                    await bounded(protocol.send('Debugger.pause'), 5000);
                    const state = await bounded(stopped, 5000);
                    observation.frames = state.callFrames.slice(0, 12).map(frame => ({ function: frame.functionName,
                        url: scripts.get(frame.location.scriptId), location: frame.location }));
                    const value = await bounded(protocol.send('Debugger.evaluateOnCallFrame', {
                        callFrameId: state.callFrames[0].callFrameId, returnByValue: true,
                        expression: 'JSON.stringify({tick:window.__ra2debug.game.currentTick,credits:window.__ra2debug.game.localPlayer.credits})',
                    }), 5000);
                    observation.game = value.result?.value && JSON.parse(value.result.value);
                    const sources = new Map(); observation.snippets = [];
                    for (const frame of state.callFrames.slice(0, 6)) {
                        const id = frame.location.scriptId;
                        if (!sources.has(id)) sources.set(id, (await bounded(protocol.send('Debugger.getScriptSource', { scriptId: id }), 5000)).scriptSource);
                        const line = sources.get(id).split('\n')[frame.location.lineNumber] ?? '';
                        observation.snippets.push({ function: frame.functionName,
                            code: line.slice(Math.max(0, frame.location.columnNumber - 300), frame.location.columnNumber + 400) });
                    }
                } catch (error) { observation.inspectionError = String(error); }
                report.stalledEvaluation = observation;
                await fs.writeFile(path.join(out, 'native-evaluation-stall.json'), JSON.stringify(observation, null, 2) + '\n');
                await bounded(app.close(), 5000).catch(async () => {
                    await bounded(app.evaluate(({ app }) => app.exit()), 5000).catch(() => {});
                });
                reject(Error('Native evaluation stalled; bounded debugger evidence retained'));
            }, 15000);
        });
        try { return await Promise.race([evaluate(expression, argument), deadline]); }
        finally { clearTimeout(timer); }
    };
}
