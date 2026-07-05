import "./settings.mjs";
import "./settings-token.mjs";
import Swarm from "./swarm.mjs";
import { MOD_NAME, SWARM_FLAG, SWARM_SIZE_FLAG } from "./constants.mjs";

let SWARMS = {};
// TODO: Remove debug accessor
window.SWARMS = SWARMS;

//Only in V10+
Hooks.on('canvasTearDown', (a, b) => {
    for (let key of Object.keys(SWARMS)) {
        SWARMS[key].destroy();
        delete SWARMS[key];
    }
});

function deleteSwarmOnToken(token) {
    if (token.id in SWARMS) {
        SWARMS[token.id].destroy();
        delete SWARMS[token.id];
    }
}
function createSwarmOnToken(token) {
    SWARMS[token.id] = new Swarm(token, token.document.getFlag(MOD_NAME, SWARM_SIZE_FLAG));
    if (!game.user.isGM) {
        token.alpha = 0;
    }
}
function hideSwarmOnToken(token, hide) {
    if (token.id in SWARMS) {
        SWARMS[token.id].hide(hide);
    }
}

Hooks.on('updateToken', (token, change, options, user_id) => {
    if (change?.flags?.[MOD_NAME]) {   // If any swarm related flag was in this update
        deleteSwarmOnToken(token);
        if (token.flags?.[MOD_NAME]?.[SWARM_FLAG]) {
            createSwarmOnToken(canvas.tokens.get(token.id));
        }
    }
    // Rebuild the swarm if the token's own size or Appearance scale changed,
    // since sprite scale/area can be derived from those values
    else if ((change.texture || change.width != undefined || change.height != undefined)
        && token.flags?.[MOD_NAME]?.[SWARM_FLAG]) {
        deleteSwarmOnToken(token);
        createSwarmOnToken(canvas.tokens.get(token.id));
    }

    if (change.hidden != undefined && token.flags?.[MOD_NAME]?.[SWARM_FLAG]) {
        hideSwarmOnToken(token, change.hidden);
    }
});

Hooks.on('updateActor', (actor, change, options, user_id) => {
    let val = change.data?.attributes?.hp?.value ?? change.system?.attributes?.hp?.value;
    if (val != undefined) {
        let tk = actor.token;
        let mx = actor?.data?.data?.attributes?.hp?.max ?? actor?.system?.attributes?.hp?.max;
        let hp = 100 * val / mx;
    }
});

// Delete token
Hooks.on('deleteToken', (token, options, user_id) => {
    if (token.id in SWARMS) {
        SWARMS[token.id].destroy();
        delete SWARMS[token.id];
    }
});

// Create token
Hooks.on('createToken', (token, options, user_id) => {
    if (token.getFlag(MOD_NAME, SWARM_FLAG) === true) {
        createSwarmOnToken(token.object);
    }
});

Hooks.on("canvasReady", () => {
    let swarm = canvas.tokens.placeables.filter((t) => { return t.document.getFlag(MOD_NAME, SWARM_FLAG); })
    for (let s of swarm) {
        createSwarmOnToken(s);
    }
});
