import {
    MOD_NAME,
    SETTING_HP_REDUCE,
    SETTING_HP_REDUCE_ATTRIBUTE_VALUE,
    SETTING_HP_REDUCE_ATTRIBUTE_MAX,
    SETTING_FADE_TIME,
    SETTING_STOP_TIME
} from "./constants.mjs";

Hooks.once("init", () => {

    game.settings.register(MOD_NAME, SETTING_HP_REDUCE, {
        name: "Reduce swarm with HP",
        hint: "Reduce the swarm as HP decreases, requires support for your system",
        scope: 'world',
        config: true,
        type: Boolean,
        default: false
    });
    game.settings.register(MOD_NAME, SETTING_HP_REDUCE_ATTRIBUTE_VALUE, {
        name: "Attribute for Current HP",
        hint: "System dependent path to current hp Attribute of token (token.[...])",
        scope: 'world',
        config: true,
        type: String,
        default: "actor.system.attributes.hp.value",
    });
    game.settings.register(MOD_NAME, SETTING_HP_REDUCE_ATTRIBUTE_MAX, {
        name: "Attribute for Max HP",
        hint: "System dependent path to max hp Attribute of token (token.[...])",
        scope: 'world',
        config: true,
        type: String,
        default: "actor.system.attributes.hp.max",
    });
    game.settings.register(MOD_NAME, SETTING_FADE_TIME, {
        name: "Fade time",
        hint: "How long, in seconds, the fade in/out should take",
        scope: 'world',
        config: true,
        type: Number,
        default: 2.0
    });
    game.settings.register(MOD_NAME, SETTING_STOP_TIME, {
        name: "Stop time",
        hint: "How long, in seconds, the stop in the stop move animation",
        scope: 'world',
        config: true,
        type: Number,
        default: 5.0
    });

});
