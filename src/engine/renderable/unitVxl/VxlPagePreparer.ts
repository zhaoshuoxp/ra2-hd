import type { PooledHdPixels } from '../builder/poolHdPixels';

export class VxlPagePreparer {
    readonly report = { pages: 0, geometries: 0, workerMs: 0 };
    private worker?: Worker;
    private pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
    private sequence = 0;
    private disposed = false;
    constructor(private createWorker = () => new Worker(new URL('./prepareVxlPage.worker.ts', import.meta.url), { type: 'module' })) {}
    prepare(images: ArrayBuffer[], size: [number, number], scale: number, limit: number): Promise<PooledHdPixels> {
        return this.request({ images, size, scale, limit }, images, 'pages');
    }
    prepareGeometry(bytes: ArrayBuffer): Promise<ArrayBuffer[]> {
        return this.request({ geometry: bytes }, [bytes], 'geometries');
    }
    private request(request: object, transfer: ArrayBuffer[], counter: 'pages' | 'geometries'): Promise<any> {
        if (this.disposed) return Promise.reject(Error('cancelled'));
        if (!this.worker) {
            this.worker = this.createWorker();
            this.worker.onmessage = ({ data }) => {
                const pending = this.pending.get(data.id);
                if (!pending) return;
                this.pending.delete(data.id); clearTimeout(pending.timer);
                data.error ? pending.reject(Error(data.error)) : pending.resolve(data.geometries ?? data.pixels);
            };
            this.worker.onerror = () => this.dispose();
            this.worker.onmessageerror = () => this.dispose();
        }
        const started = performance.now(), id = ++this.sequence;
        return new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => this.dispose(), 15000);
            this.pending.set(id, { timer, reject, resolve: value => {
                this.report[counter]++; this.report.workerMs += performance.now() - started; resolve(value);
            } });
            try { this.worker!.postMessage({ id, ...request }, transfer); }
            catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
        });
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(Error('cancelled')); }
        this.pending.clear(); this.worker?.terminate();
    }
}
