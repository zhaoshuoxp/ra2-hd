import React, { useState, useEffect } from 'react';
import { Palette } from '../../data/Palette';
import { PcxFile } from '../../data/PcxFile';
import { ShpFile } from '../../data/ShpFile';
import { ImageUtils } from '../../engine/gfx/ImageUtils';
import { ImageContext, ImageContextClass } from './ImageContext';
import { uiArt } from '../hd/UiArt';
interface ImageProps {
    src: string;
    palette?: string;
}
export const Image: React.FC<ImageProps> = (props) => {
    const context = ImageContext;
    const [imageUrl, setImageUrl] = useState("");
    const [nativeSize, setNativeSize] = useState<{ src: string; width: number; height: number }>();
    const [hdImage, setHdImage] = useState<{ src: string; url: string }>();
    const [artEpoch, setArtEpoch] = useState(0);
    useEffect(() => uiArt.subscribe(() => setArtEpoch(value => value + 1)), []);
    useEffect(() => {
        setHdImage(undefined);
        if (!props.src.endsWith('.pcx') || nativeSize?.src !== props.src
            || !uiArt.enabled || !uiArt.has(props.src, nativeSize.width, nativeSize.height)) return;
        const owner = {};
        const release = uiArt.acquire(props.src, asset => {
            if (!asset?.url || !uiArt.reserveSurface(owner, asset.bytes, asset.bytes, 'dom')) return;
            setHdImage({ src: props.src, url: asset.url });
        });
        return () => { release(); uiArt.releaseSurface(owner); };
    }, [props.src, nativeSize, artEpoch]);
    useEffect(() => {
        let url: string;
        let cleanup: (() => void) | undefined;
        if (ImageContextClass.imageUrlCache.has(props.src)) {
            url = ImageContextClass.imageUrlCache.get(props.src)!;
        }
        else if (context.vfs?.fileExists(props.src)) {
            const extension = props.src.split(".").pop();
            if (extension === "shp") {
                const palette = props.palette;
                if (palette && context.vfs.fileExists(palette)) {
                    const shpFile = new ShpFile(context.vfs.openFile(props.src));
                    const paletteFile = new Palette(context.vfs.openFile(palette));
                    url = ImageUtils.convertShpToCanvas(shpFile, paletteFile).toDataURL();
                }
                else {
                    console.warn(`Palette "${palette}" not found in VFS"`);
                    url = "";
                }
            }
            else if (extension === "pcx") {
                const pcxFile = new PcxFile(context.vfs.openFile(props.src));
                url = pcxFile.toDataUrl();
            }
            else if (extension === "png") {
                const stream = context.vfs.openFile(props.src).stream;
                const blob = new Blob([new Uint8Array(stream.buffer, stream.byteOffset, stream.byteLength)], { type: "image/png" });
                url = URL.createObjectURL(blob);
                cleanup = () => {
                    URL.revokeObjectURL(url);
                    ImageContextClass.imageUrlCache.delete(props.src);
                };
            }
            else {
                console.warn(`Unknown image format "${extension}"`);
                url = "";
            }
            ImageContextClass.imageUrlCache.set(props.src, url);
        }
        else {
            url = context.cdnBaseUrl
                ? context.cdnBaseUrl + props.src.substring(0, props.src.lastIndexOf(".")) + ".png"
                : (console.warn(`Image "${props.src}" not found in VFS`), "");
        }
        setImageUrl(url);
        return cleanup;
    }, [props.src]);
    const hd = hdImage?.src === props.src && uiArt.enabled ? hdImage : undefined;
    const size = nativeSize?.src === props.src ? nativeSize : undefined;
    return imageUrl ? <img src={hd?.url ?? imageUrl} width={size?.width} height={size?.height}
        data-ui-hd-image={hd ? props.src : undefined}
        onLoad={event => {
            if (hd) return;
            const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
            if (width && height && (!size || size.width !== width || size.height !== height))
                setNativeSize({ src: props.src, width, height });
        }}/> : null;
};
