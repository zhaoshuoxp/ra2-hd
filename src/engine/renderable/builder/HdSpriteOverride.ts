import * as THREE from "three";
import type { HdTileMap } from './poolHdPage';

export interface HdSpriteFrame {
    page: number;
    sampleRect: { x: number; y: number; width: number; height: number };
}

// Created only after whole-member validation. The caller owns page lifetime.
export interface HdSpriteOverride {
    identity: string;
    visualOpacity?: number;
    antialias?: boolean;
    constructionCompletionFrame?: number;
    constructionCompletionFrames?: ReadonlyMap<number, number>;
    frames: HdSpriteFrame[];
    pages: { base: THREE.Texture; data: THREE.Texture; tiles?: HdTileMap }[];
}
