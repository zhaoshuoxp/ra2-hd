import { expect, test } from 'bun:test';
import { registerMissingVeteranCameo } from '../../../src/gui/screen/game/cameoFallback';

test('missing veteran cameo retains its UI identity with the existing native base frame', () => {
    const normal = { filename: 'falcicon.shp', width: 60, height: 48 };
    const images = new Map([['falcicon.shp', normal]]);
    registerMissingVeteranCameo(images, 'falcicon.shp', 'falcuico.shp');
    expect(images.get('falcuico.shp')).toBe(normal);
    expect(normal.filename).toBe('falcicon.shp');
    const distinct = { filename: 'native-alt.shp', width: 60, height: 48 };
    images.set('falcuico.shp', distinct);
    registerMissingVeteranCameo(images, 'falcicon.shp', 'falcuico.shp');
    expect(images.get('falcuico.shp')).toBe(distinct);
    registerMissingVeteranCameo(images, 'absent.shp', 'other.shp');
    expect(images.has('other.shp')).toBe(false);
});
