import type { DecodedHdPage } from './resolveHdSprite';
import { poolHdPixels, type PooledHdPixels } from './poolHdPixels';

// One sprite resolution owns this lazy worker and submits its pages in order.
// Clone inputs so borrowed RGBA views remain valid for the same-data CPU fallback.
export class HdTilePoolPreparer {
    private worker?: Worker;
    private pending?: { id: number; resolve(value: PooledHdPixels | undefined): void;
        reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
    private sequence = 0;
    private broken = false;
    private disposed = false;
    constructor(private createWorker = () => new Worker(new URL('./poolHdPage.worker.ts', import.meta.url), { type: 'module' }),
        private timeoutMs = 15000) {}
    async prepare(base: DecodedHdPage, data: DecodedHdPage, limit: number): Promise<PooledHdPixels | undefined> {
        if (this.disposed) throw Error('cancelled');
        if (this.pending) throw Error('hd-tile-pool-already-pending');
        if (!this.broken) {
            try { return await this.request(base, data, limit); }
            catch {
                if (this.disposed) throw Error('cancelled');
                this.breakWorker(Error('hd-tile-pool-failure'));
            }
        }
        return poolHdPixels(base, data, limit);
    }
    private request(base: DecodedHdPage, data: DecodedHdPage, limit: number): Promise<PooledHdPixels | undefined> {
        if (!this.worker) {
            this.worker = this.createWorker();
            this.worker.onmessage = ({ data }) => {
                const pending = this.pending;
                if (!pending || data.id !== pending.id || data.kind !== 'hd-tile-pool') return;
                this.pending = undefined;
                clearTimeout(pending.timer);
                data.error ? pending.reject(Error(data.error)) : pending.resolve(data.pixels);
            };
            this.worker.onerror = () => this.breakWorker(Error('hd-tile-pool-worker-error'));
            this.worker.onmessageerror = () => this.breakWorker(Error('hd-tile-pool-message-error'));
        }
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.breakWorker(Error('hd-tile-pool-timeout')), this.timeoutMs);
            this.pending = { id, resolve, reject, timer };
            const page = (value: DecodedHdPage) => ({ ...value, rgba: value.rgba.byteLength === value.rgba.buffer.byteLength
                ? value.rgba : value.rgba.slice() });
            try { this.worker!.postMessage({ kind: 'hd-tile-pool', id, base: page(base), data: page(data), limit }); }
            catch { this.breakWorker(Error('hd-tile-pool-post-error')); }
        });
    }
    private breakWorker(error: Error) {
        this.broken = true;
        this.worker?.terminate();
        this.worker = undefined;
        if (this.pending) {
            clearTimeout(this.pending.timer);
            this.pending.reject(error);
            this.pending = undefined;
        }
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.breakWorker(Error('cancelled'));
    }
}
