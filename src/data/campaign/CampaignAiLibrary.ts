import type { IniFile } from '../IniFile';
import type { CampaignEdition } from './CampaignDefinition';

export const originalCampaignAiSha256 = '1feac6ddea6886b177ddf7e5f8580b7a99a63f12684f2cbb42831671bb7a8a79';
export const originalCampaignAiCanonicalSha256 = 'c5af34dc4dfc0c0368465cc3e7b256473c16fc01ecc6b59ca52607c7283225fd';
export const originalYrCampaignAiSha256 = '5df41eaec00a78d0760ef5eecdf27d65ae1cd537309c7eac973318266986f89d';
export const originalYrCampaignAiCanonicalSha256 = 'd2fab584d4d7cf830982250c46b0d877f82b397b5179d2f4661a35779cdd9d35';

export function campaignAiSourceSha256(edition: CampaignEdition): string {
    return edition === 'yr' ? originalYrCampaignAiSha256 : originalCampaignAiSha256;
}

export async function verifyOriginalCampaignAi(ini: IniFile, sourceSha256?: string, edition: CampaignEdition = 'ra2'): Promise<void> {
    if (sourceSha256 !== campaignAiSourceSha256(edition)) throw new Error('Campaign global AI source identity mismatch');
    const bytes = new TextEncoder().encode(ini.toString());
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== (edition === 'yr' ? originalYrCampaignAiCanonicalSha256 : originalCampaignAiCanonicalSha256)) {
        throw new Error('Campaign global AI library differs from the imported original');
    }
}
