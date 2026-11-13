import type { CampaignLaunch } from './CampaignRuntime';

// Saved launches without the forward flag retain their recorded percentage
// interpretation and trait initialization. Fresh launches carry the forward flag.
export function originalCampaignStartingVeterancy(launch?: CampaignLaunch): boolean {
    return !!launch && (launch.startingVeterancyVersion === 1 || (launch.semanticsVersion ?? 1) >= 19);
}
