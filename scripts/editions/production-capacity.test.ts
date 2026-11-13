import { expect, test } from 'bun:test';
import { ProductionQueue, QueueStatus, QueueType } from '../../src/game/player/production/ProductionQueue';

test('losing the last aircraft dock clears production even after a rejected zero-capacity order', () => {
    const queue = new ProductionQueue(QueueType.Aircrafts, 0, 10), aircraft = { name: 'ORCA' };
    queue.push(aircraft, 1, 1200);
    expect(queue.getAll()).toEqual([]); expect(queue.status).toBe(QueueStatus.Idle);
    // Earlier saves may contain a zero-quantity entry from the rejected order.
    (queue as any).items.push({ rules: aircraft, quantity: 0 });
    queue.maxSize = 0;
    expect(queue.getAll()).toEqual([]); expect(queue.currentSize).toBe(0);
    queue.maxSize = 4; queue.push(aircraft, 4, 1200);
    queue.getFirst()!.creditsSpent = 300; queue.getFirst()!.progress = .25;
    queue.maxSize = 2;
    expect(queue.getFirst()).toMatchObject({ quantity: 2, creditsSpent: 300, progress: .25 });
    queue.maxSize = 0;
    expect(queue.getAll()).toEqual([]); expect(queue.status).toBe(QueueStatus.Idle);
});

test('capacity reduction retains queue order and the partially paid first item', () => {
    const queue = new ProductionQueue(QueueType.Aircrafts, 8, 10);
    const first = { name: 'ORCA' }, second = { name: 'BEAG' }, last = { name: 'BPLN' };
    queue.push(first, 2, 1200); queue.push(second, 3, 1200); queue.push(last, 2, 1000);
    const paid = queue.getFirst()!; paid.creditsSpent = 600; paid.progress = .5;
    queue.maxSize = 4;
    expect(queue.getAll().map(item => [item.rules.name, item.quantity])).toEqual([['ORCA', 2], ['BEAG', 2]]);
    expect(queue.getFirst()).toBe(paid); expect(queue.currentSize).toBe(4);
    queue.push(last, 1, 1000); expect(queue.getAll()).toHaveLength(2);
    queue.maxSize = 2;
    expect(queue.getAll()).toEqual([paid]); expect(queue.status).toBe(QueueStatus.Active);
    queue.maxSize = 6;
    expect(queue.getAll()).toEqual([paid]); expect(paid.creditsSpent).toBe(600);
});
