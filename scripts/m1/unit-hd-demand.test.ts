import { expect, test } from 'bun:test';
import { UnitHdDemand } from '../../src/engine/renderable/builder/UnitHdDemand';

function fixture() {
  const images = new Map(['A', 'B', 'C'].map((name) => [name, { filename: `${name}.shp` }]));
  const calls: string[] = [],
    disposed: string[] = [];
  const demand = new UnitHdDemand(
    new Set(images.keys()),
    12,
    async (name, budget) => {
      calls.push(name);
      await Promise.resolve();
      if (budget < 8)
        return {
          density: 1,
          gpuBytes: 0,
          members: new Map(),
          attempts: [{ reason: 'combined-budget' }],
        };
      const image = images.get(name)!;
      return {
        density: 2,
        gpuBytes: 8,
        attempts: [],
        members: new Map([
          [image.filename, { image, override: { identity: name, frames: [], pages: [] } }],
        ]),
      };
    },
    (family) => family.members.forEach((member) => disposed.push(member.override.identity)),
  );
  return { images, calls, disposed, demand };
}

test('prewarmed allocations transfer to real bindings without a second load or permanent warm pin', async () => {
  const { demand, images, calls, disposed } = fixture();
  const cancel = demand.prewarm('A');
  await demand.idle();
  const release = demand.bind('A', images.get('A'), () => {});
  cancel();
  await demand.idle();
  expect(calls).toEqual(['A']); expect(disposed).toEqual([]);
  demand.prewarm('B'); await demand.idle();
  expect(demand.report.families.B.status).toBe('BUDGET_FALLBACK');
  release(); await demand.idle();
  expect(calls).toEqual(['A', 'B', 'B']); expect(disposed).toEqual(['A']);
  expect(demand.report.peakBytes).toBeLessThanOrEqual(12);
  demand.dispose(); expect(disposed).toEqual(['A', 'B']);
});

test('demand allocations are shared, capacity fallback preserves live leases, and idle families release before replacement', async () => {
  const { images, calls, disposed, demand } = fixture();
  const seen: string[] = [];
  const first = demand.bind('A', images.get('A'), (override) => seen.push(override!.identity));
  const second = demand.bind('A', images.get('A'), (override) => seen.push(override!.identity));
  expect(demand.families.size).toBe(0);
  await demand.idle();
  expect(calls).toEqual(['A']);
  expect(seen).toEqual(['A', 'A']);
  expect(demand.report.gpuBytes).toBe(8);
  const third = demand.bind('B', images.get('B'), (override) => seen.push(override!.identity));
  await demand.idle();
  expect(demand.report.families.B.status).toBe('BUDGET_FALLBACK');
  expect(disposed).toEqual([]);
  first();
  await demand.idle();
  expect(disposed).toEqual([]);
  second();
  await demand.idle();
  expect(disposed).toEqual(['A']);
  expect(seen).toEqual(['A', 'A', 'B']);
  expect(demand.report.peakBytes).toBe(8);
  expect(demand.report.gpuBytes).toBe(8);
  third();
  demand.dispose();
  demand.dispose();
  expect(disposed).toEqual(['A', 'B']);
  expect(demand.report.gpuBytes).toBe(0);
});

test('disposing during a pending allocation releases its completion without publishing to dead renderables', async () => {
  let finish!: (value: any) => void;
  const released: any[] = [],
    shown: any[] = [];
  const demand = new UnitHdDemand(
    new Set(['A']),
    16,
    () => new Promise((resolve) => (finish = resolve)),
    (family) => released.push(family),
  );
  demand.bind('A', { filename: 'a.shp' }, (value) => shown.push(value));
  demand.dispose();
  const family = { density: 2, gpuBytes: 8, attempts: [], members: new Map([['a.shp', {}]]) };
  finish(family);
  await demand.idle();
  expect(released).toEqual([family]);
  expect(shown).toEqual([]);
  expect(demand.families.size).toBe(0);
});

test('failed families do not retry per actor, unknown identities do not load, and source objects must match', async () => {
  let loads = 0;
  const demand = new UnitHdDemand(
    new Set(['A']),
    16,
    async () => {
      loads++;
      throw Error('corrupt member');
    },
    () => {},
  );
  demand.bind('OTHER', { filename: 'A.shp' }, () => {
    throw Error('Unexpected binding');
  });
  demand.bind('A', { filename: 'A.shp' }, () => {
    throw Error('Unexpected binding');
  });
  await demand.idle();
  demand.bind('A', { filename: 'A.shp' }, () => {
    throw Error('Unexpected binding');
  });
  await demand.idle();
  expect(loads).toBe(1);
  expect(demand.report.families.A.status).toBe('FAILED');
  demand.dispose();
  const second = fixture(),
    seen: unknown[] = [];
  second.demand.bind('A', { filename: 'A.shp' }, (value) => seen.push(value));
  await second.demand.idle();
  expect(seen).toEqual([undefined]);
  second.demand.dispose();
});

test('publication failure restores Original and releases the complete allocation', async () => {
  const { demand, images, disposed } = fixture();
  const seen: unknown[] = [];
  demand.bind('A', images.get('A'), (value) => seen.push(value?.identity));
  demand.bind('A', images.get('A'), (value) => {
    if (value) throw Error('renderer rejected material');
  });
  await demand.idle();
  expect(seen).toEqual(['A', undefined]);
  expect(disposed).toEqual(['A']);
  expect(demand.families.size).toBe(0);
  expect(demand.report.gpuBytes).toBe(0);
  expect(demand.report.families.A.status).toBe('FAILED');
  demand.dispose();
});

test('visible previews yield their budget to queued production without evicting live actors', async () => {
  const { demand, images, calls, disposed } = fixture();
  demand.preview('A'); await demand.idle();
  demand.prewarm('B'); await demand.idle();
  expect(calls).toEqual(['A', 'B']); expect(disposed).toEqual(['A']);
  let shown: string | undefined;
  demand.bind('B', images.get('B'), value => { shown = value?.identity; });
  expect(shown).toBe('B');
  demand.preview('C'); await demand.idle();
  expect(demand.report.families.C.status).toBe('BUDGET_FALLBACK');
  expect(disposed).toEqual(['A']); expect(demand.report.peakBytes).toBeLessThanOrEqual(12);
  demand.dispose();
});

test('a visible preview transfers synchronously to first render without reloading', async () => {
  const { demand, images, calls } = fixture();
  const leavePage = demand.preview('A'); await demand.idle();
  demand.prewarm('A');
  let shown: string | undefined;
  demand.bind('A', images.get('A'), value => { shown = value?.identity; });
  leavePage();
  expect(shown).toBe('A'); expect(calls).toEqual(['A']);
  demand.dispose();
});

test('focused or queued demand overtakes pending visible previews', async () => {
  const { demand, calls, disposed } = fixture();
  demand.preview('A'); demand.preview('B'); demand.prewarm('C');
  await demand.idle();
  expect(calls).toEqual(['A', 'C', 'B', 'A']);
  expect(disposed).toEqual(['A']);
  expect(demand.report.families.C.status).toBe('READY');
  expect(demand.report.families.B.status).toBe('BUDGET_FALLBACK');
  demand.dispose();
});


test('urgent demand cancels an in-flight preview at a loader boundary without permanently failing it', async () => {
  let finish!: () => void, isCancelled!: () => boolean;
  const calls: string[] = [];
  const demand = new UnitHdDemand(new Set(['preview', 'urgent']), 16, async (name, _budget, cancelled) => {
    calls.push(name);
    if (calls.length === 1) {
      isCancelled = cancelled;
      await new Promise<void>(resolve => { finish = resolve; });
      if (cancelled()) throw Error('cancelled');
    }
    return { members: new Map(), vxl: { identity: name, parts: [], dispose() {} },
      density: 2, gpuBytes: 4, attempts: [] };
  }, family => family.vxl?.dispose());
  demand.preview('preview');
  expect(isCancelled()).toBe(false);
  demand.prewarm('urgent'); expect(isCancelled()).toBe(true); finish();
  await demand.idle();
  expect(calls).toEqual(['preview', 'urgent', 'preview']);
  expect(demand.report.families.urgent.status).toBe('READY');
  expect(demand.report.families.preview.status).toBe('READY');
  demand.dispose();
});
