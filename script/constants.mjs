export const MOD_NAME = "swarm-reanimated";

export const SWARM_FLAG = "isSwarm";
export const SWARM_SIZE_FLAG = "swarmSize";
export const SWARM_SPEED_FLAG = "swarmSpeed";
export const SWARM_IMAGE_FLAG = "swarmImage";
export const SWARM_AREA_FLAG = "swarmArea";
export const SWARM_USE_TOKEN_SCALE_FLAG = "swarmUseTokenScale";
export const SWARM_SCALE_FLAG = "swarmScale";
export const SWARM_FOLLOW_TOKEN_FLAG = "swarmFollowToken";

export const ANIM_TYPE_FLAG = "animation";
export const ANIM_TYPE_CIRCULAR = "circular";
export const ANIM_TYPE_RAND_SQUARE = "random";
export const ANIM_TYPE_SPIRAL = "spiral";
export const ANIM_TYPE_SKITTER = "skitter";
export const ANIM_TYPE_STOPNMOVE = "move_stop_move";
export const ANIM_TYPE_FORMATION_SQUARE = "formation";
export const ANIM_TYPES = [ANIM_TYPE_CIRCULAR, ANIM_TYPE_RAND_SQUARE, ANIM_TYPE_SPIRAL, ANIM_TYPE_SKITTER, ANIM_TYPE_STOPNMOVE, ANIM_TYPE_FORMATION_SQUARE];

export const PLACEMENT_FLAG = "swarmPlacement";
export const PLACEMENT_BELOW = "below";
export const PLACEMENT_SAME = "same";
export const PLACEMENT_ABOVE = "above";
export const PLACEMENT_OPTIONS = [PLACEMENT_BELOW, PLACEMENT_SAME, PLACEMENT_ABOVE];

// Legacy boolean flag, replaced by PLACEMENT_FLAG's three-way dropdown. Kept only so tokens
// configured before that change keep behaving the way they were set up (see getSwarmPlacement).
export const OVER_FLAG = "swarmOverPlayers";

export const SETTING_HP_REDUCE = "reduceSwarmWithHP";
export const SETTING_HP_REDUCE_ATTRIBUTE_VALUE = "attributeHpValue";
export const SETTING_HP_REDUCE_ATTRIBUTE_MAX = "attributeHpMax";
export const SETTING_FADE_TIME = "fadeTime";
export const SETTING_STOP_TIME = "stopTime";

export const theta = 0.01;
export const SIGMA = 5;
export const GAMMA = 1000;

export function lang(k) {
    return game.i18n.localize("SWARM-REANIMATED." + k);
}

// Resolves a token's swarm placement, falling back to the pre-dropdown boolean flag for tokens
// that were configured before "Above Player Tokens" became a Below/Same/Above choice.
export function getSwarmPlacement(tokenDocument) {
    const placement = tokenDocument.getFlag(MOD_NAME, PLACEMENT_FLAG);
    if (placement) return placement;
    return tokenDocument.getFlag(MOD_NAME, OVER_FLAG) ? PLACEMENT_ABOVE : PLACEMENT_BELOW;
}
