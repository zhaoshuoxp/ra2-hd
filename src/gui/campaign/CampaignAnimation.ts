interface CampaignAnimation { activeFrames: number[]; framesPerSecond: number }

export function campaignAnimationFrame(time: number, started: number, animation: CampaignAnimation, loop = true): number {
    // A queued browser frame can carry the start-of-frame timestamp from before
    // React's effect began. Keep that first callback on the first source frame.
    const elapsed = Math.max(0, time - started);
    const step = Math.floor(elapsed * animation.framesPerSecond / 1000);
    return animation.activeFrames[loop ? step % animation.activeFrames.length : Math.min(step, animation.activeFrames.length - 1)];
}
