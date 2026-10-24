import { SaveError, SkirmishSave, saveChecksum, validateSave } from './SkirmishSave';

interface SaveRecord { id: string; payload: SkirmishSave; checksum: number }
export class SkirmishSaveStorage {
    constructor(private readonly indexedDb: IDBFactory = indexedDB) { }
    private async open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = this.indexedDb.open('ra2-hd-skirmish-saves', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('saves', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new SaveError('HD:SaveStorageError'));
        });
    }
    private async transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        const db = await this.open();
        try {
            return await new Promise<T>((resolve, reject) => {
                const tx = db.transaction('saves', mode);
                const request = operation(tx.objectStore('saves'));
                tx.oncomplete = () => resolve(request.result);
                tx.onabort = () => reject(tx.error ?? request.error ?? new SaveError('HD:SaveStorageError'));
                tx.onerror = () => reject(tx.error ?? request.error ?? new SaveError('HD:SaveStorageError'));
            });
        } finally { db.close(); }
    }
    async list(edition: string): Promise<SkirmishSave[]> {
        const records = await this.transaction<SaveRecord[]>('readonly', store => store.getAll());
        return records.filter(row => row.payload?.edition === edition).map(row => row.payload)
            .sort((a, b) => b.savedAt - a.savedAt);
    }
    async load(id: string, edition: string): Promise<SkirmishSave> {
        const record = await this.transaction<SaveRecord | undefined>('readonly', store => store.get(id));
        if (!record || record.id !== record.payload?.id || record.checksum !== saveChecksum(record.payload))
            throw new SaveError('HD:SaveInvalid');
        validateSave(record.payload, edition);
        return record.payload;
    }
    async save(save: SkirmishSave): Promise<void> {
        validateSave(save);
        if (JSON.stringify(save).length > 64 * 1024 * 1024) throw new SaveError('HD:SaveStorageError');
        const record: SaveRecord = { id: save.id, payload: save, checksum: saveChecksum(save) };
        await this.transaction('readwrite', store => store.put(record));
    }
    async delete(id: string): Promise<void> {
        await this.transaction('readwrite', store => store.delete(id));
    }
}
