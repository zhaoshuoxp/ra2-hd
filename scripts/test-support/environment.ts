import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nativeShpSource, requiredBytes, resourceRoot, selectedPack, sha256 } from './resources';
import { environmentHdContractForTheater, environmentMemberSource }
    from '../../src/engine/renderable/builder/environmentHdContract';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

// Derive geometry from the imported retail SHP, never an obsolete authoring guide.
export function environmentEntries(theater: string, family: string): PowerPlantHdEntry[] {
    const contract = environmentHdContractForTheater(theater)!;
    const { directory, manifest: pack } = selectedPack('environment', theater);
    if (!pack.families[family]) throw Error(`Selected ${theater} pack lacks ${family}`);
    return pack.families[family].members.map((member: any) => {
        const metadata = path.join(directory, member.path);
        const bytes = requiredBytes(path.relative(resourceRoot, metadata));
        if (sha256(bytes) !== member.sha256) throw Error(`Environment metadata hash mismatch: ${family}/${member.member}`);
        const manifest = JSON.parse(bytes.toString());
        const descriptor = environmentMemberSource(contract, family, member.member)!;
        const edition = Object.entries(contract.identities).find(([, identities]: any) =>
            Object.values(identities).includes(family))?.[0] as 'ra2' | 'yr' | undefined;
        // Bridge/smudge families have no unit identity; both editions share their native SHP.
        const { source } = nativeShpSource(edition ?? 'yr', member.member,
            descriptor.sha256, descriptor.bodyFrames, theater);
        return { image: { filename: member.member }, source, manifest, manifestHash: member.sha256,
            read: async (filename: string, hash?: string, size?: number) => {
                const page = manifest.variants.flatMap((variant: any) => variant.pages.map((page: any) =>
                    ({ ...page, density: variant.density }))).find((page: any) =>
                    page.base === filename || page.data === filename);
                if (!page) throw Error(`Unknown environment page: ${filename}`);
                const file = path.join(path.dirname(metadata), String(page.density), page.id,
                    page.base === filename ? 'base.png' : 'data.png');
                const encoded = requiredBytes(path.relative(resourceRoot, file));
                if (hash && sha256(encoded) !== hash || size !== undefined && encoded.length !== size)
                    throw Error(`Environment page identity mismatch: ${file}`);
                const decoded = execFileSync('python3', ['-c',
                    'import sys,struct;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',
                    file], { maxBuffer: 128 * 1024 * 1024 });
                return { width: decoded.readUInt32LE(0), height: decoded.readUInt32LE(4),
                    rgba: new Uint8Array(decoded.subarray(8)) };
            } } as PowerPlantHdEntry;
    });
}
