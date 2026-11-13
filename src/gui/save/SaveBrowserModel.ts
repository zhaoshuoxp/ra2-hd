export interface SaveSummary { id: string; name: string; savedAt: number; tick: number; gameOpts: any }
export interface SaveStorage<T> {
    list(edition: string): Promise<T[]>;
    load(id: string, edition: string): Promise<T>;
    save(record: T): Promise<void>;
    delete(id: string): Promise<void>;
}
export class SaveBrowserError extends Error { constructor(public readonly key: string) { super(key); } }
