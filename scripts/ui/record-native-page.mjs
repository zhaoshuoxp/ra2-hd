import fs from 'node:fs/promises';

/** Record the actual native-app compositor through CDP, including DOM/SVG/video layers. */
export async function recordNativePage(page, file) {
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
        canvas.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none'; document.body.append(canvas);
        const stream = canvas.captureStream(20), chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 6000000 });
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        window.__nativePageRecording = { canvas, stream, recorder, chunks }; recorder.start(1000);
    });
    let queue = Promise.resolve(), frames = 0, failure, accepting = true;
    cdp.on('Page.screencastFrame', event => {
        void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
        if (!accepting) return;
        queue = queue.then(async () => {
            await page.evaluate(async data => {
                const frame = await createImageBitmap(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: 'image/jpeg' }));
                const canvas = window.__nativePageRecording?.canvas;
                if (!canvas) { frame.close(); return; }
                canvas.getContext('2d').drawImage(frame, 0, 0, canvas.width, canvas.height); frame.close();
            }, event.data);
            frames++;
        }).catch(error => { failure = error; });
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
    return async () => {
        accepting = false;
        await cdp.send('Page.stopScreencast'); await queue;
        const encoded = await page.evaluate(async () => {
            const state = window.__nativePageRecording;
            await new Promise(resolve => { state.recorder.onstop = resolve; state.recorder.stop(); });
            state.stream.getTracks().forEach(track => track.stop()); state.canvas.remove();
            const bytes = new Uint8Array(await new Blob(state.chunks, { type: 'video/webm' }).arrayBuffer());
            let data = '';
            for (let i = 0; i < bytes.length; i += 32768) data += String.fromCharCode(...bytes.subarray(i, i + 32768));
            delete window.__nativePageRecording; return btoa(data);
        });
        await fs.writeFile(file, Buffer.from(encoded, 'base64')); await cdp.detach();
        if (failure) throw failure;
        if (frames < 100) throw Error('Native page recording did not receive sufficient frames');
        return { file, frames, width: 1280, height: 720, method: 'Actual native app compositor; CDP frames encoded locally.' };
    };
}
