import { ObjectType } from '../engine/type/ObjectType';
import { PaletteType } from '../engine/type/PaletteType';
import { TheaterType } from '../engine/TheaterType';
import type { OfficialSkirmishEntry } from './officialSkirmish';

const approvedMaps = new Map([
    ['a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574',
        { theater: TheaterType.Snow, palette: 'libsno.pal', prefix: 'ca' }],
    ['c3f4f1c670fe69ba74e35aeee38a30f5d4d04a50dd4a15ddbbb7c443d029056a',
        { theater: TheaterType.Urban, palette: 'liburb.pal', prefix: 'cu' }],
]);
const paletteHash = '79e668c9bd08bc5eed811df19de2af418cf8b434b97abf1fe2d65809321507e0';
const sources = {
    CACITY01: '7219f468060fcf77c503c8accda9654735b75a3d34add54d81ddc2eaf95fe3d7',
    CACITY02: '91630025b88905ed82632a2839d215ae4845c821e031512b7dca68aaa2d609d2',
    CACITY03: 'e8753f23d0f5e6889d5a7503e1b495e31b8c2cdbf8e1de05b90ed11e4655b752',
    CACITY04: '0c26ccf72982cb4bde981b1485950ff1a60f012981ebec64b5db1e1acdada4b4'
};
type PaletteArt = { imageName: string; useTheaterExtension: boolean;
    paletteType: PaletteType; customPaletteName?: string };

// Preserve the approved exact source hashes; both original library palettes have identical bytes.
export async function applyOfficialLibraryPalettes(entry: OfficialSkirmishEntry | undefined,
    theater: { type: TheaterType; settings: { libPaletteName: string } },
    art: { getObject(name: string, type: ObjectType): PaletteArt },
    imageFinder: { findByObjectArt(art: PaletteArt): { filename?: string } },
    readSource: (member: string) => Uint8Array) {
    const report: { status: string; mapSha256?: string; paletteSha256?: string;
        members: { identity: string; member: string; sourceSha256: string }[] } = { status: 'NOT_APPLICABLE', members: [] };
    const approved = approvedMaps.get(entry?.source.sha256 ?? '');
    if (!approved || theater.type !== approved.theater) return report;
    report.mapSha256 = entry!.source.sha256;
    const digest = async (member: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
        Uint8Array.from(readSource(member)).buffer))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (theater.settings.libPaletteName !== approved.palette) return { ...report, status: 'PALETTE_MEMBER_MISMATCH' };
    report.paletteSha256 = await digest(approved.palette);
    if (report.paletteSha256 !== paletteHash) return { ...report, status: 'PALETTE_SOURCE_MISMATCH' };
    const pending: PaletteArt[] = [];
    for (const [identity, sourceHash] of Object.entries(sources)) {
        const objectArt = art.getObject(identity, ObjectType.Building);
        const member = approved.prefix + identity.toLowerCase().slice(2) + '.shp';
        if (imageFinder.findByObjectArt(objectArt).filename?.toLowerCase() !== member)
            return { ...report, status: 'IMAGE_MEMBER_MISMATCH' };
        const sourceSha256 = await digest(member);
        if (sourceSha256 !== sourceHash) return { ...report, status: 'IMAGE_SOURCE_MISMATCH' };
        report.members.push({ identity, member, sourceSha256 });
        pending.push(objectArt);
    }
    // Publish together after all checks; source bytes, owner regions, geometry, states and rules stay original.
    for (const objectArt of pending) {
        objectArt.paletteType = PaletteType.Custom;
        objectArt.customPaletteName = 'lib';
    }
    report.status = 'APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE';
    return report;
}
