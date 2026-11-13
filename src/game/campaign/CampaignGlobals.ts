export type CampaignGlobalState = [number, boolean][];

export class CampaignGlobals {
    private values = new Set<number>();
    constructor(initial: CampaignGlobalState = []) {
        if (!Array.isArray(initial) || new Set(initial.map(entry => entry?.[0])).size !== initial.length) {
            throw new Error('Invalid campaign global state');
        }
        for (const entry of initial) {
            if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[1] !== 'boolean') throw new Error('Invalid campaign global entry');
            this.set(entry[0], entry[1]);
        }
    }
    get(id: number): boolean { this.assertId(id); return this.values.has(id); }
    set(id: number, value: boolean): void {
        this.assertId(id);
        if (typeof value !== 'boolean') throw new Error('Invalid campaign global value');
        if (value) this.values.add(id); else this.values.delete(id);
    }
    snapshot(): CampaignGlobalState { return [...this.values].sort((a, b) => a - b).map(id => [id, true]); }
    private assertId(id: number): void {
        if (!Number.isSafeInteger(id) || id < 0 || id > 0x7fffffff) throw new Error('Invalid campaign global id');
    }
}

// Only an explicit Continue carries the outgoing state. Retry uses the input
// of the failed mission; direct selection never reads completion history.
export function campaignStartGlobals(campaign: any, continuing: boolean): CampaignGlobalState | undefined {
    if ((campaign.launch.semanticsVersion ?? 1) < 12) return undefined;
    return new CampaignGlobals(continuing ? campaign.globals.snapshot() : campaign.launch.incomingGlobals).snapshot();
}
