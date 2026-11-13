export interface CampaignWorldBackdrop {
    schema: 'campaign-world-backdrop-v1';
    file: string;
    width: number;
    height: number;
    scale: number;
    sourceLocator: [number, number];
    nativeLocator: [number, number];
    gridInk: string;
    gridOrigin: [number, number];
    gridStep: [number, number];
}

export function readCampaignWorldBackdrop(value: unknown): CampaignWorldBackdrop {
    const world = value as CampaignWorldBackdrop;
    const point = (value: unknown, width: number, height: number) => Array.isArray(value)
        && value.length === 2 && value.every(Number.isFinite)
        && value[0] >= 0 && value[0] <= width && value[1] >= 0 && value[1] <= height;
    if (!world || world.schema !== 'campaign-world-backdrop-v1'
        || typeof world.file !== 'string' || !/^interface-world-[a-z0-9-]+\.png$/.test(world.file)
        || world.width !== 1915 || world.height !== 821
        || !Number.isFinite(world.scale) || world.scale < .4 || world.scale > 1
        || !point(world.sourceLocator, world.width, world.height) || !point(world.nativeLocator, 800, 520)
        || world.sourceLocator[0] < 155
        || !point(world.gridOrigin, 800, 520) || !Array.isArray(world.gridStep) || world.gridStep.length !== 2
        || !world.gridStep.every(step => Number.isFinite(step) && step >= 80 && step <= 320)
        || typeof world.gridInk !== 'string' || !/^#[0-9a-f]{6}$/.test(world.gridInk)) {
        throw Error('campaign-world-backdrop-contract');
    }
    return world;
}
