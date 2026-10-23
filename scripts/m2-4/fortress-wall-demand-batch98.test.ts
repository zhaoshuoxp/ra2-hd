import { expect, test } from 'bun:test';
import { ImageFinder } from '../../src/engine/ImageFinder';

function fixture(published = false, registered = true) {
    const requests: string[] = [];
    let releases = 0;
    const demand = { report: { families: registered ? { GAFWLL: { status: 'NOT_REQUESTED' } } : {} },
        bindBuilding(name: string) { requests.push(name); return () => releases++; } };
    const complete = new Map([[{ filename: 'ggfwll.shp' }, { identity: 'complete-pinned-wall' }]]);
    const theater = { type: 'NEWURBAN', environmentHd: { families: new Map(published ? [['newurban-gafwll', complete]] : []) } };
    const finder = new ImageFinder(new Map(), theater, undefined, undefined, undefined, undefined, {}, demand as any, 'yr');
    return { finder, requests, releases: () => releases };
}

test('a newly constructed fortress wall leases the already accepted Yuri family', () => {
    const { finder, requests, releases } = fixture();
    expect(finder.hasWallHdDemand('GAFWLL')).toBe(true);
    const release = finder.bindWallHd('GAFWLL', {}, () => {});
    expect(requests).toEqual(['GAFWLL']);
    release();
    expect(releases()).toBe(1);
});

test('a complete preloaded environment wall does not allocate a second accepted faction family', () => {
    const { finder, requests } = fixture(true);
    expect(finder.hasWallHdDemand('GAFWLL')).toBe(false);
    finder.bindWallHd('GAFWLL', {}, () => {})();
    expect(requests).toEqual([]);
});

test('an edition without the registered Yuri family keeps Original without requesting unrelated resources', () => {
    const { finder, requests } = fixture(false, false);
    expect(finder.hasWallHdDemand('GAFWLL')).toBe(false);
    finder.bindWallHd('GAFWLL', {}, () => {})();
    expect(requests).toEqual([]);
    expect(finder.hasWallHdDemand('DNOA')).toBe(false);
});
