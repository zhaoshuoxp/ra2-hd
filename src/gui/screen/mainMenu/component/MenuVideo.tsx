import React, { useEffect, useRef, useState } from 'react';
import { HdMenuScene } from './HdMenuScene';
import { uiArt } from '@/gui/hd/UiArt';
interface MenuVideoProps { src: string | File | undefined; active?: boolean }
export function MenuVideo({ src, active = true }: MenuVideoProps) {
    const video = useRef<HTMLVideoElement>(null);
    const savedTime = useRef(0);
    const [revision, refresh] = useState(0);
    const [failed, setFailed] = useState<string[]>([]);
    const [fileUrl, setFileUrl] = useState<string>();
    useEffect(() => uiArt.subscribe(() => refresh(n => n + 1)), []);
    useEffect(() => {
        if (!(src instanceof File) || !src.size) { setFileUrl(undefined); return; }
        const url = URL.createObjectURL(src); setFileUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [src]);
    const source = [uiArt.menuVideoSource(), uiArt.menuVideoSource(true),
        typeof src === 'string' ? src : fileUrl].find(url => url && !failed.includes(url));
    useEffect(() => {
        const el = video.current;
        if (!el) return;
        if (active) void el.play().catch(() => {});
        else el.pause();
        return () => { savedTime.current = el.currentTime || savedTime.current; el.pause(); };
    }, [source, active, revision]);
    // Unmount the decoder outside Home; returning resumes the original loop.
    if (active && uiArt.enabled) return <HdMenuScene videoSrc={uiArt.menuVideoSource(true)} playbackTime={savedTime} />;
    return <div className="video-wrapper" style={{ position: 'relative' }}>
        {active && source && <video ref={video} key={source} src={source} loop playsInline muted autoPlay
            data-ui-menu-video={source} style={{ outline: 'none', objectFit: 'cover' }}
            onLoadedMetadata={() => {
                const el = video.current;
                if (el && Number.isFinite(el.duration)) el.currentTime = savedTime.current % el.duration;
            }}
            onTimeUpdate={() => { if (video.current) savedTime.current = video.current.currentTime; }}
            onError={() => setFailed(values => [...values, source])} />}
    </div>;
}
