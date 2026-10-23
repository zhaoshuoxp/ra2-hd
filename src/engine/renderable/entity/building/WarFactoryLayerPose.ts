import { AnimProps } from '../../../AnimProps';
import { AnimationType } from './AnimationType';

/** Retail production layers are normal/damaged poses plus shadow tails. */
export function configureWarFactoryLayerPose(props: AnimProps, family: string,
    type: AnimationType, damaged: boolean): boolean {
    if (!['GAWEAP', 'YAWEAP'].includes(family) || props.frameCount !== 4
        || (type !== AnimationType.FACTORY_DEPLOYING && type !== AnimationType.FACTORY_ROOF_DEPLOYING)) return false;
    // Roof art declares LoopEnd=9 despite having only four source frames.
    // Hold the native color pose until FactoryTrait ends delivery, preserving
    // its gameplay timing and both foreground/under-door depth layers.
    const frame = damaged ? 1 : 0;
    props.start = props.end = props.loopStart = props.loopEnd = frame;
    return true;
}
