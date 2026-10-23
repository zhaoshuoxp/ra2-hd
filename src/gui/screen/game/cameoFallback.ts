interface CameoImages<T> {
    has(name: string): boolean;
    get(name: string): T | undefined;
    set(name: string, image: T): void;
}

// Some retail art declares an absent veteran image (notably falcuico.shp).
// Preserve the declared UI identity while using the normal native frame as its fallback.
export function registerMissingVeteranCameo<T>(images: CameoImages<T>, normal: string, alternate: string): void {
    if (normal === alternate || images.has(alternate) || !images.has(normal)) return;
    const image = images.get(normal);
    if (image) images.set(alternate, image);
}
