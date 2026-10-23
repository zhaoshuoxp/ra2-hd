import { prepareVxlGeometry } from './prepareVxlGeometry';
import { prepareVxlPixels } from './prepareVxlPixels';

// Only immutable, hash-checked PNG buffers cross into this match-owned worker.
self.onmessage = async ({ data: request }) => {
    try {
        if (request.geometry) {
            const geometries = prepareVxlGeometry(request.geometry);
            self.postMessage({ id: request.id, geometries }, { transfer: geometries });
            return;
        }
        const decoded = [];
        for (const bytes of request.images) {
            const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }),
                { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
            try {
                if (bitmap.width !== request.size[0] || bitmap.height !== request.size[1]
                    || Math.ceil(bitmap.width * request.scale) > request.limit
                    || Math.ceil(bitmap.height * request.scale) > request.limit) throw Error('vxl-page-size');
                const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                const context = canvas.getContext('2d', { willReadFrequently: true })!;
                context.drawImage(bitmap, 0, 0);
                decoded.push({ width: bitmap.width, height: bitmap.height,
                    rgba: new Uint8Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data) });
            } finally { bitmap.close(); }
        }
        const pixels = prepareVxlPixels(decoded[0], decoded[1], request.scale, request.limit);
        self.postMessage({ id: request.id, pixels }, { transfer: [pixels.color.buffer, pixels.remap.buffer, pixels.lookup.buffer] });
    } catch (error) {
        self.postMessage({ id: request.id, error: error instanceof Error ? error.message : 'vxl-preparation-failure' });
    }
};
