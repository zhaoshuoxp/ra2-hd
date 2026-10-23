import { downsampleHdPage } from '../builder/downsampleHdPage';
import { poolHdPixels } from '../builder/poolHdPixels';
import type { DecodedHdPage } from '../builder/resolveHdSprite';

export function prepareVxlPixels(base: DecodedHdPage, data: DecodedHdPage, scale: number, limit: number) {
    if (base.width !== data.width || base.height !== data.height || base.rgba.length !== base.width * base.height * 4
        || data.rgba.length !== base.rgba.length || ![0.5, 1].includes(scale)) throw Error('vxl-page-size');
    for (let i = 0; i < data.rgba.length; i += 4) {
        if (data.rgba[i + 1] >= 16 || data.rgba[i + 2] !== 0 || data.rgba[i + 3] !== 255
            || (data.rgba[i] && !base.rgba[i + 3])) throw Error('vxl-owner-data');
    }
    const decoded = scale < 1 ? downsampleHdPage(base, data) : [base, data];
    const pooled = poolHdPixels(decoded[0], decoded[1], limit);
    if (!pooled) throw Error('vxl-lossless-pool');
    return pooled;
}
