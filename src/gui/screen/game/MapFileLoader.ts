import { FileNotFoundError } from '@/data/vfs/FileNotFoundError';
import { VirtualFile } from '@/data/vfs/VirtualFile';
import { openOfficialSkirmish } from '@/offline/officialSkirmish';
export class MapFileLoader {
    constructor(private resourceLoader: any, private vfs?: any) { }
    async load(filename: string, cancellationToken?: any): Promise<VirtualFile> {
        cancellationToken?.throwIfCancelled();
        const official = openOfficialSkirmish(filename);
        if (official) return official;
        let mapFile: VirtualFile | undefined;
        if (this.vfs) {
            try {
                mapFile = await this.vfs.openFileWithRfs(filename);
            }
            catch (error) {
                if (!(error instanceof FileNotFoundError)) {
                    console.error(error);
                }
            }
        }
        if (!mapFile) {
            throw new FileNotFoundError(`Offline map missing from staged archives: ${filename}`);
        }
        return mapFile;
    }
}
