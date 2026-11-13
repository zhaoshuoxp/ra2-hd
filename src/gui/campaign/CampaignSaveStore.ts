import type { CampaignCheckpoint } from '../../game/campaign/CampaignCheckpoint';
import { campaignMissionName, isCampaignMissionIdentity } from '../../data/campaign/CampaignMission';
import type { CampaignEdition } from '../../data/campaign/CampaignDefinition';
import { isCampaignDifficulty, type CampaignDifficulty } from '../../data/campaign/CampaignDefinition';

export function campaignSaveSlot(difficulty: CampaignDifficulty, mission = 'sov01t.map', edition: CampaignEdition = 'ra2'): string {
    if (!isCampaignDifficulty(difficulty)) throw new Error('Unsupported campaign save slot');
    campaignMissionName(edition, mission);
    return edition + '/' + mission + '/' + difficulty;
}
function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ra2-hd-campaign-saves', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('checkpoints');
        request.onerror = () => reject(request.error ?? new Error('Campaign save database could not open'));
        request.onsuccess = () => resolve(request.result);
    });
}
export async function readCampaignSave(difficulty: CampaignDifficulty = 'normal'): Promise<CampaignCheckpoint | undefined> {
    const slot = campaignSaveSlot(difficulty);
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction('checkpoints', 'readonly');
            const request = transaction.objectStore('checkpoints').get(slot);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally { db.close(); }
}
export async function writeCampaignSave(checkpoint: CampaignCheckpoint): Promise<void> {
    if (!isCampaignMissionIdentity(checkpoint.identity.edition, checkpoint.identity.mission)
        || !isCampaignDifficulty(checkpoint.options?.campaign?.difficulty)) throw new Error('Unsupported campaign save slot');
    const slot = campaignSaveSlot(checkpoint.options.campaign.difficulty, checkpoint.identity.mission, checkpoint.identity.edition as CampaignEdition);
    const db = await database();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('checkpoints', 'readwrite');
            transaction.objectStore('checkpoints').put(checkpoint, slot);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error ?? new Error('Campaign save was aborted'));
        });
    } finally { db.close(); }
}
