import type { GameEdition } from '../../../../editions/GameEdition';
import type { AnimProps } from '../../../AnimProps';

/** Retain the clock endpoint without sampling the following aggregate member. */
export function buildingAnimationDisplayFrame(edition: GameEdition, identity: string,
    props: AnimProps, frame: number): number {
    if (edition !== 'yr' || frame !== props.frameCount || props.end !== frame
        || props.loopEnd !== frame || props.reverse || !props.shadow || props.loopCount !== 1) return frame;
    const image = props.art.getString('Image', props.art.name);
    const dominator = identity === 'YAPPET' && props.frameCount === 38 && props.start === 20
        && (image === 'YAPPET_F' || image === 'YAPPET_H');
    const mutator = identity === 'YAGNTC' && props.frameCount === 62
        && ((image === 'YAGNTC_F' && props.start === 31) || (image === 'YAGNTC_H' && props.start === 32));
    return dominator || mutator ? frame - 1 : frame;
}
