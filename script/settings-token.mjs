import {
    MOD_NAME,
    SWARM_FLAG,
    SWARM_SIZE_FLAG,
    SWARM_SPEED_FLAG,
    SWARM_AREA_FLAG,
    SWARM_USE_TOKEN_SCALE_FLAG,
    SWARM_SCALE_FLAG,
    SWARM_FOLLOW_TOKEN_FLAG,
    ANIM_TYPE_FLAG,
    ANIM_TYPES,
    OVER_FLAG,
    lang
} from "./constants.mjs";

function flagName(flag_name) {
    return `flags.${MOD_NAME}.${flag_name}`;
}

function checkboxGroup(app, flag_name, label, hint) {
    const input = foundry.applications.fields.createCheckboxInput({
        name: flagName(flag_name),
        value: !!app.token.getFlag(MOD_NAME, flag_name)
    });
    return foundry.applications.fields.createFormGroup({ rootId: app.id, label, hint, input });
}

function numberGroup(app, flag_name, label, { placeholder = null, defaultValue = null, step = null, hint = null } = {}) {
    let value = app.token.getFlag(MOD_NAME, flag_name);
    if (value === undefined || value === null) value = defaultValue;
    const input = foundry.applications.fields.createNumberInput({
        name: flagName(flag_name),
        value,
        step,
        placeholder
    });
    return foundry.applications.fields.createFormGroup({ rootId: app.id, label, hint, input });
}

function selectGroup(app, flag_name, label, values, hint) {
    const input = foundry.applications.fields.createSelectInput({
        name: flagName(flag_name),
        value: app.token.getFlag(MOD_NAME, flag_name),
        options: values.map(v => ({ value: v, label: v }))
    });
    return foundry.applications.fields.createFormGroup({ rootId: app.id, label, hint, input });
}

function imageSelector(app, flag_name, label) {
    const input = foundry.applications.elements.HTMLFilePickerElement.create({
        name: flagName(flag_name),
        value: app.token.getFlag(MOD_NAME, flag_name) ?? "",
        type: "imagevideo"
    });
    return foundry.applications.fields.createFormGroup({ rootId: app.id, label, input });
}

// Hook into the token config render
Hooks.on("renderTokenConfig", (app, html) => {
    if (!game.user.isGM) return;

    // Create a fieldset to match Foundry's own section styling (e.g. Dynamic Token Ring)
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = "Swarm";
    fieldset.append(legend);

    fieldset.append(checkboxGroup(app, SWARM_FLAG, "Enabled", lang("settings.enabled")));
    fieldset.append(checkboxGroup(app, OVER_FLAG, "Above Player Tokens", lang("settings.above")));
    fieldset.append(numberGroup(app, SWARM_SIZE_FLAG, "Swarm Count",
        { placeholder: 20, defaultValue: 20, step: 1, hint: lang("settings.count") }));
    fieldset.append(numberGroup(app, SWARM_SPEED_FLAG, "Swarm Movement Speed",
        { placeholder: 1.0, defaultValue: 1.0, step: 0.1, hint: lang("settings.movement") }));
    fieldset.append(numberGroup(app, SWARM_AREA_FLAG, "Swarm Grid Size",
        { step: 0.5, hint: lang("settings.gridSize") }));
    fieldset.append(checkboxGroup(app, SWARM_FOLLOW_TOKEN_FLAG, "Move With Token",
        lang("settings.followToken")));
    fieldset.append(selectGroup(app, ANIM_TYPE_FLAG, "Animation", ANIM_TYPES,
        lang("settings.animation")));
    fieldset.append(checkboxGroup(app, SWARM_USE_TOKEN_SCALE_FLAG, "Use Token Scale",
        lang("settings.tokenScale")));
    fieldset.append(numberGroup(app, SWARM_SCALE_FLAG, "Swarm Sprite Scale",
        { placeholder: 1.0, defaultValue: 1.0, step: 0.05, hint: lang("settings.spriteScale") }));

    // Add the fieldset to the bottom of the Appearance tab
    html.querySelector("div[data-tab='appearance']").append(fieldset);

    // Set the apps height correctly
    app.setPosition();
});
