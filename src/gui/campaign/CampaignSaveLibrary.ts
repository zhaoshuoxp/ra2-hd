import type { CampaignCheckpoint } from '../../game/campaign/CampaignCheckpoint';
import { validCampaignPendingCommands, validCampaignPresentation } from '../../game/campaign/CampaignCheckpoint';
import { campaignSaveSlot, readCampaignSave } from './CampaignSaveStore';
import { isCampaignDifficulty, type CampaignDifficulty, type CampaignEdition } from '../../data/campaign/CampaignDefinition';
import { SaveBrowserError, type SaveStorage, type SaveSummary } from '../save/SaveBrowserModel';
import { isCampaignMissionIdentity } from '../../data/campaign/CampaignMission';
import { validSavedTrainer } from '../../game/trainer/TrainerSave';

export interface CampaignSaveRecord extends SaveSummary {
    version: 1;
    edition: CampaignEdition;
    mission: string;
    checkpoint: CampaignCheckpoint;
    checksum: string;
}
const legacyPrefix = 'legacy-ra2-sov01t-';
function legacyDifficulty(id: string): CampaignDifficulty | undefined {
    const difficulty = id.startsWith(legacyPrefix) ? id.slice(legacyPrefix.length) : undefined;
    return isCampaignDifficulty(difficulty) ? difficulty : undefined;
}
async function digest(value: unknown): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function validateCampaignSaveRecord(record: CampaignSaveRecord): Promise<void> {
    const invalid = () => { throw new SaveBrowserError('HD:SaveInvalid'); };
    if (!record || record.version !== 1 || !isCampaignMissionIdentity(record.edition, record.mission)
        || typeof record.id !== 'string' || !record.id || record.id.length > 128
        || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 80
        || !Number.isFinite(record.savedAt) || !Number.isSafeInteger(record.tick) || record.tick < 0) invalid();
    const checkpoint = record.checkpoint;
    if (!checkpoint || checkpoint.schemaVersion !== 1 || checkpoint.compatibility !== 'm3-1-campaign-journal-v3'
        || !validCampaignPendingCommands(checkpoint)
        || !(checkpoint.mediaPolicy === 'no-pending-media' || checkpoint.mediaPolicy === 'resume-presentation-v1'
            && validCampaignPresentation(checkpoint.presentation, checkpoint.options?.campaign?.semanticsVersion ?? 1)) || checkpoint.identity?.edition !== record.edition
        || checkpoint.options?.campaign?.edition !== record.edition || checkpoint.options?.campaign?.mission !== record.mission
        || checkpoint.identity.mission !== record.mission || !isCampaignDifficulty(checkpoint.options?.campaign?.difficulty)
        || checkpoint.options.campaign.diagnostic || record.tick !== checkpoint.tick
        || checkpoint.trainer !== undefined && !validSavedTrainer(checkpoint.trainer, checkpoint.tick)
        || checkpoint.playTime !== undefined && (!Number.isFinite(checkpoint.playTime.elapsedMs) || checkpoint.playTime.elapsedMs < 0
            || !Number.isFinite(checkpoint.playTime.speed) || checkpoint.playTime.speed <= 0 || checkpoint.playTime.speed > 7.5)
        || JSON.stringify(record.gameOpts) !== JSON.stringify(checkpoint.options)) invalid();
    const { checksum: checkpointChecksum, ...payload } = checkpoint;
    if (await digest(payload) !== checkpointChecksum) invalid();
    const { checksum, ...envelope } = record;
    if (await digest(envelope) !== checksum) invalid();
}
export async function campaignSaveRecord(checkpoint: CampaignCheckpoint, name: string,
    id: string = crypto.randomUUID(), savedAt = Date.now()): Promise<CampaignSaveRecord> {
    const payload = { version: 1 as const, id, name: name.trim().slice(0, 80), savedAt, edition: checkpoint.identity.edition as CampaignEdition,
        mission: checkpoint.identity.mission, tick: checkpoint.tick, gameOpts: checkpoint.options, checkpoint };
    const record = { ...payload, checksum: await digest(payload) };
    await validateCampaignSaveRecord(record);
    return record;
}

// Keep both existing databases and schemas intact. The legacy manual slot is a
// virtual row; listing never migrates, replaces or deletes a user's old save.
export class CampaignSaveLibrary implements SaveStorage<CampaignSaveRecord> {
    constructor(private readonly legacyName: string, private readonly indexedDb: IDBFactory = indexedDB) {}
    private async transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = this.indexedDb.open('ra2-hd-campaign-library', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('saves', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new SaveBrowserError('HD:SaveStorageError'));
        });
        try {
            return await new Promise<T>((resolve, reject) => {
                const tx = db.transaction('saves', mode), request = operation(tx.objectStore('saves'));
                tx.oncomplete = () => resolve(request.result);
                tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new SaveBrowserError('HD:SaveStorageError'));
            });
        } finally { db.close(); }
    }
    private async legacy(difficulty: CampaignDifficulty): Promise<CampaignSaveRecord | undefined> {
        const checkpoint = await readCampaignSave(difficulty);
        return checkpoint && campaignSaveRecord(checkpoint, this.legacyName, legacyPrefix + difficulty, checkpoint.timestamp);
    }
    async list(edition: string): Promise<CampaignSaveRecord[]> {
        if (edition !== 'ra2' && edition !== 'yr') return [];
        const records = await this.transaction<CampaignSaveRecord[]>('readonly', store => store.getAll());
        for (const difficulty of edition === 'ra2' ? ['easy', 'normal', 'hard'] as const : []) {
            const legacy = await this.legacy(difficulty);
            if (legacy && !records.some(row => row.id === legacy.id)) records.push(legacy);
        }
        return records.filter(row => row.edition === edition && isCampaignMissionIdentity(edition, row.mission)).sort((a, b) => b.savedAt - a.savedAt);
    }
    async load(id: string, edition: string): Promise<CampaignSaveRecord> {
        if (edition !== 'ra2' && edition !== 'yr') throw new SaveBrowserError('HD:SaveEditionMismatch');
        const difficulty = legacyDifficulty(id);
        const record = await this.transaction<CampaignSaveRecord | undefined>('readonly', store => store.get(id))
            ?? (difficulty ? await this.legacy(difficulty) : undefined);
        if (!record) throw new SaveBrowserError('HD:SaveInvalid');
        if (record.edition !== edition) throw new SaveBrowserError('HD:SaveEditionMismatch');
        await validateCampaignSaveRecord(record);
        return record;
    }
    async save(record: CampaignSaveRecord): Promise<void> {
        await validateCampaignSaveRecord(record);
        if (JSON.stringify(record).length > 64 * 1024 * 1024) throw new SaveBrowserError('HD:SaveStorageError');
        await this.transaction('readwrite', store => store.put(record));
    }
    async delete(id: string): Promise<void> {
        await this.transaction('readwrite', store => store.delete(id));
        const difficulty = legacyDifficulty(id);
        if (difficulty) {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = this.indexedDb.open('ra2-hd-campaign-saves', 1);
                request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
            });
            try {
                await new Promise<void>((resolve, reject) => {
                    const tx = db.transaction('checkpoints', 'readwrite');
                    tx.objectStore('checkpoints').delete(campaignSaveSlot(difficulty));
                    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
                });
            } finally { db.close(); }
        }
    }
}
