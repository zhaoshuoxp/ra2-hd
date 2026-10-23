import { poolHdPixels } from './poolHdPixels';

// Decoding and contract checks precede this unchanged, renderer-free calculation.
self.onmessage = ({ data: request }) => {
    if (request.kind !== 'hd-tile-pool') return;
    try {
        const pixels = poolHdPixels(request.base, request.data, request.limit);
        const transfer = pixels ? [pixels.color.buffer, pixels.remap.buffer, pixels.lookup.buffer] : [];
        self.postMessage({ kind: request.kind, id: request.id, pixels }, { transfer });
    } catch (error) {
        self.postMessage({ kind: request.kind, id: request.id,
            error: error instanceof Error ? error.message : 'hd-tile-pool-failure' });
    }
};
