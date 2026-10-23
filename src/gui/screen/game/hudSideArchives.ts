import type { VirtualFileSystem } from '@/data/vfs/VirtualFileSystem';

// Offline imports mount nested containers under their full retail paths. Remove
// both those aliases and ordinary mounts before selecting exactly one HUD side.
export function unloadHudSideArchives(vfs: Pick<VirtualFileSystem, 'listArchives' | 'removeArchive'>): void {
    for (const name of vfs.listArchives()) {
        if (/(^|\/)sidec0[123](cd|md)?\.mix$/.test(name)) vfs.removeArchive(name);
    }
}
