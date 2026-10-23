import React, { useEffect, useRef } from 'react';

import { menuFootageVertex as vertex, menuFootageFragment as fragment } from './OriginalMenuShader';

/** Register the retail movie under the HD logo, retaining unobstructed cinematic pixels above it. */
export function OriginalMenuFootage({ src, onReady, playbackTime }: {
    src: string; onReady: (ready: boolean) => void; playbackTime?: { current: number };
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const canvas = ref.current!, gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) { onReady(false); return; }
        const shaders: WebGLShader[] = [];
        const compile = (type: number, text: string) => {
            const shader = gl.createShader(type)!; gl.shaderSource(shader, text); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.warn('Menu movie shader unavailable', gl.getShaderInfoLog(shader)); gl.deleteShader(shader); return undefined;
            }
            shaders.push(shader); return shader;
        };
        const program = gl.createProgram()!;
        const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
        if (!vs || !fs) { shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program); onReady(false); return; }
        gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program); onReady(false); return;
        }
        gl.useProgram(program);
        const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const textures = [0, 1, 2].map(unit => {
            const texture = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            const filter = gl.LINEAR;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.uniform1i(gl.getUniformLocation(program, ['movie', 'reference', 'cleanMask'][unit]), unit);
            return texture;
        });
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        const imageSources = ['/res/presentation/menu-retail-reference-r3.png', '/res/presentation/menu-retail-glyph-guard-r5.png'];
        const video = videoRef.current!, images = imageSources.map(() => new Image());
        video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
        video.src = src;
        let live = true, loaded = false, callback = 0, imageCount = 0;
        const timeLocation = gl.getUniformLocation(program, 'movieTime');
        const durationLocation = gl.getUniformLocation(program, 'cycleDuration');
        const render = () => {
            if (!live || !loaded || video.readyState < 2) return false;
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, textures[0]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            gl.uniform1f(timeLocation, video.currentTime);
            gl.uniform1f(durationLocation, video.duration || 28.734);
            gl.viewport(0, 0, canvas.width, canvas.height); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            canvas.dataset.movieTime = video.currentTime.toFixed(3);
            canvas.dataset.movieFrames = String(Number(canvas.dataset.movieFrames ?? 0) + 1);
            onReady(true); return true;
        };
        const draw = () => {
            if (render()) callback = video.requestVideoFrameCallback(draw);
        };
        images.forEach((image, i) => {
            image.onload = () => {
                if (!live) return;
                gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, textures[i + 1]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                loaded = ++imageCount === images.length;
                if (loaded && video.readyState >= 2) draw();
            };
            image.onerror = () => onReady(false); image.src = imageSources[i];
        });
        video.onloadeddata = () => { if (loaded) draw(); };
        video.onseeked = () => { render(); };
        video.onloadedmetadata = () => {
            if (playbackTime && Number.isFinite(video.duration)) video.currentTime = playbackTime.current % video.duration;
        };
        video.onerror = () => onReady(false);
        void video.play().catch(() => onReady(false));
        return () => {
            live = false; if (playbackTime) playbackTime.current = video.currentTime;
            video.cancelVideoFrameCallback(callback); video.pause();
            video.onerror = video.onloadeddata = video.onloadedmetadata = video.onseeked = null;
            video.removeAttribute('src'); video.load();
            for (const image of images) { image.onload = null; image.onerror = null; }
            for (const texture of textures) gl.deleteTexture(texture);
            gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        };
    }, [src, onReady, playbackTime]);
    return <div style={{ width: '100%', height: '100%' }}>
        <video ref={videoRef} hidden muted playsInline data-retail-menu-video="true"/>
        <canvas ref={ref} width={1672} height={941} data-retail-menu-footage={src}
            style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>;
}
