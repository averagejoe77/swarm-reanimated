import * as utils from "./utils.mjs"
import {
    MOD_NAME,
    SWARM_AREA_FLAG,
    SWARM_SPEED_FLAG,
    SWARM_USE_TOKEN_SCALE_FLAG,
    SWARM_SCALE_FLAG,
    SWARM_FOLLOW_TOKEN_FLAG,
    ANIM_TYPE_FLAG,
    ANIM_TYPE_CIRCULAR,
    ANIM_TYPE_RAND_SQUARE,
    ANIM_TYPE_SPIRAL,
    ANIM_TYPE_SKITTER,
    ANIM_TYPE_STOPNMOVE,
    ANIM_TYPE_FORMATION_SQUARE,
    OVER_FLAG,
    SETTING_HP_REDUCE,
    SETTING_HP_REDUCE_ATTRIBUTE_VALUE,
    SETTING_HP_REDUCE_ATTRIBUTE_MAX,
    SETTING_FADE_TIME,
    SETTING_STOP_TIME,
    theta,
    SIGMA,
    GAMMA
} from "./constants.mjs";

let swarm_socket;
Hooks.once("socketlib.ready", () => {
    // socketlib is activated, lets register our function moveAsGM
    swarm_socket = socketlib.registerModule(MOD_NAME);
    swarm_socket.register("wildcards", wildcards);
});

async function wildcards(token_id) {
    let tk = canvas.tokens.get(token_id);
    if (tk) {
        return await tk.actor.getTokenImages();
    }
    else {
        return [];
    }
}

function getHealthEstimate(token) {
    let reduceHP = game.settings.get(MOD_NAME, SETTING_HP_REDUCE);
    if (!reduceHP) return 1;  // always return 100% health

    let hpValue = 0;
    let hpMax = 0;

    switch (game.system.id) {
        case 'pf1':
        case 'pf2e':
        case 'dnd5e':
            hpValue = token?.actor?.data?.data?.attributes?.hp?.value ?? token?.actor?.system?.attributes?.hp?.value;
            hpMax = token?.actor?.data?.data?.attributes?.hp?.max ?? token?.actor?.system?.attributes?.hp?.max;
            return hpValue / hpMax;
        default:
            hpValue = Object.byString(token, game.settings.get(MOD_NAME, SETTING_HP_REDUCE_ATTRIBUTE_VALUE));
            hpMax = Object.byString(token, game.settings.get(MOD_NAME, SETTING_HP_REDUCE_ATTRIBUTE_MAX));
            if (hpValue && hpMax) {
                return hpValue / hpMax;
            } else {
                console.warn("No health estimate implemented for system", game.system.id);
            }
    }
}

export default class Swarm {
    constructor(token, number) {
        this.t = 0;
        this.token = token;

        // Roam area: independent of the token's own size, defaults to the token's size if unset
        let areaFlag = token.document.getFlag(MOD_NAME, SWARM_AREA_FLAG);
        this.areaW = ((areaFlag > 0) ? areaFlag : token.document.width) * canvas.grid.size;
        this.areaH = ((areaFlag > 0) ? areaFlag : token.document.height) * canvas.grid.size;

        // Sprite scale: either follow the token's own Appearance scale, or use an independent value
        this.useTokenScale = !!token.document.getFlag(MOD_NAME, SWARM_USE_TOKEN_SCALE_FLAG);
        let scaleFlag = token.document.getFlag(MOD_NAME, SWARM_SCALE_FLAG);
        this.customScale = (scaleFlag > 0) ? scaleFlag : 1;

        // If true, the whole swarm translates rigidly with the token instead of each sprite individually catching up
        this.followToken = !!token.document.getFlag(MOD_NAME, SWARM_FOLLOW_TOKEN_FLAG);
        this.lastCenter = { x: token.center.x, y: token.center.y };

        this.currentHPPercent = this.calculateHPPercent();  // Calculate current HP percent
        this.number = this.determineVisibleSprites(this.currentHPPercent, number);  // Determine initial number of visible sprites
        this.maxSprites = number;  // Store the maximum number of sprites
        this.sprites = [];
        this.dest = [];
        this.speeds = [];
        this.ofsets = [];
        this.waiting = [];
        this.images = null;   // Cache of this swarm's candidate sprite images, lazily loaded once
        this.resizing = false;
        this.layer = new PIXI.Container();

        // this.randomRotation = true;
        this.faded = token.document.hidden;
        this.visible = (this.faded) ? 0 : this.number;


        this.layer.elevation = (token.document.getFlag(MOD_NAME, OVER_FLAG) ? 10000 : 0);
        this.layer.sort = 120; // Above tiles at 100
        canvas.primary.addChild(this.layer);

        this.created = false;

        // Ride Foundry's shared canvas ticker instead of spinning up a private one per swarm,
        // so every swarm's animation stays in lockstep with the engine's own render loop
        this.tick = canvas.app.ticker;
        let anim = token.document.getFlag(MOD_NAME, ANIM_TYPE_FLAG);
        this.set_destinations = this.circular;
        switch (anim) {
            case ANIM_TYPE_CIRCULAR:
                this.set_destinations = this.circular;
                break;
            case ANIM_TYPE_RAND_SQUARE:
                this.set_destinations = this.randSquare;
                break;
            case ANIM_TYPE_SPIRAL:
                this.set_destinations = this.spiral;
                break;
            case ANIM_TYPE_SKITTER:
                this.set_destinations = this.skitter;
                break;
            case ANIM_TYPE_STOPNMOVE:
                this.set_destinations = this.stopMoveStop;
                break;
            case ANIM_TYPE_FORMATION_SQUARE:
                this.set_destinations = this.formSquare;
                // this.randomRotation = false;
                break;
        }
        this.tick.add(this.anim, this);
    }

    // Lazily resolve (and cache) the pool of images sprites in this swarm may use
    async loadImages() {
        if (this.images) return this.images;
        let use_random_image = this.token.actor.prototypeToken.randomImg;
        if (use_random_image) {
            this.images = await swarm_socket.executeAsGM("wildcards", this.token.id);
        } else {
            this.images = [this.token.document.texture.src];
        }
        return this.images;
    }

    addSprite(images) {
        const token = this.token;
        // waiting times, only used for stop-move
        this.waiting.push(0);
        // Random offset
        this.ofsets.push(Math.random() * 97);
        // Pick an image from the list at random
        let img = images[Math.floor(Math.random() * images.length)];
        let sprite = PIXI.Sprite.from(img);
        sprite.anchor.set(.5);

        // Sprites initial position, a random position within the swarm's roam area (centered on the token)
        sprite.x = token.center.x - this.areaW / 2 + Math.random() * this.areaW;
        sprite.y = token.center.y - this.areaH / 2 + Math.random() * this.areaH;
        // Hidden initially if the token itself is currently faded/hidden
        sprite.alpha = this.faded ? 0 : 1;

        // A callback to get correct aspect ratio, and to start the video
        let scale = () => {
            // Get the largest dimention, and scale around that
            let spriteMaxDimension = Math.max(sprite.texture.width, sprite.texture.height);
            if (this.useTokenScale) {
                // Match the token's own size and Appearance scale
                sprite.scale.x = token.document.texture.scaleX * token.w / spriteMaxDimension;
                sprite.scale.y = token.document.texture.scaleY * token.h / spriteMaxDimension;
            } else {
                // Use an independent scale, ignoring the token's own size/scale
                sprite.scale.x = this.customScale * canvas.grid.size / spriteMaxDimension;
                sprite.scale.y = this.customScale * canvas.grid.size / spriteMaxDimension;
            }

            // Check if the texture selected is a video, and potentially start it
            let src = sprite.texture.baseTexture.resource.source;
            src.loop = true;
            src.muted = true; // Autostarting videos must explicitly be muted (chrome restriction)
            if (src.play) src.play();
        };
        if (sprite.texture.baseTexture.valid) {
            scale();
        } else {
            sprite.texture.baseTexture.on('loaded', scale);
        }
        // Set the initial destination to its initial position
        this.dest.push({ x: sprite.x, y: sprite.y });
        this.sprites.push(sprite);
        let swarm_speed_flag = token.document.getFlag(MOD_NAME, SWARM_SPEED_FLAG);
        if (swarm_speed_flag === undefined) swarm_speed_flag = 1;
        // Add 50% of the speed as variability on each sprites speed
        this.speeds.push(swarm_speed_flag * .5 + swarm_speed_flag * Math.random() * 0.5)
        // Add this sprite to the correct layer
        this.layer.addChild(sprite);
    }

    removeSprite() {
        let sprite = this.sprites.pop();
        this.dest.pop();
        this.speeds.pop();
        this.ofsets.pop();
        this.waiting.pop();
        this.layer.removeChild(sprite);
        sprite.destroy();
    }

    // Grow or shrink the live sprite pool to match the target count. Dead/reduced swarm
    // members are actually destroyed rather than merely hidden, so a swarm sitting at 0 HP
    // (or otherwise reduced) costs nothing per tick instead of still animating hidden sprites.
    async setSpriteCount(target) {
        if (target < this.sprites.length) {
            while (this.sprites.length > target) this.removeSprite();
            return;
        }
        if (target <= this.sprites.length || this.resizing) return;
        this.resizing = true;
        try {
            let images = await this.loadImages();
            while (this.sprites.length < target) {
                this.addSprite(images);
            }
        } finally {
            this.resizing = false;
        }
    }

    calculateHPPercent() {
        return getHealthEstimate(this.token);
    }

    determineVisibleSprites(hpPercent, maxNumber) {
        // No sprites when hp zero
        if (hpPercent <= 0) return 0;
        const minSprites = 1;
        return Math.max(minSprites, Math.round(hpPercent * maxNumber));
    }

    /**
     * The main animation callback for this swarm
     * @param {Number} t Time fraction of the current fps
     */
    anim(t) {
        if (!this.created) {
            this.setSpriteCount(this.number);  // Only spawn what's currently alive/visible
            this.created = true;
        }

        // Rigidly translate every sprite (and its destination) by however far the token has moved
        // since last tick, so the swarm keeps pace with the token instead of trickling towards it
        let center = this.token.center;
        let dx = center.x - this.lastCenter.x;
        let dy = center.y - this.lastCenter.y;
        if (this.followToken && (dx !== 0 || dy !== 0)) {
            for (let i = 0; i < this.sprites.length; ++i) {
                this.sprites[i].x += dx;
                this.sprites[i].y += dy;
                this.dest[i].x += dx;
                this.dest[i].y += dy;
            }
        }
        this.lastCenter.x = center.x;
        this.lastCenter.y = center.y;

        t = Math.min(t, 2.0);// Cap frame skip to two frames
        // Convert the ticker's normalized deltaTime back to milliseconds using PIXI's fixed
        // targetFPMS constant. Using the instantaneous, fluctuating this.tick.FPS here instead
        // (as before) made ms proportional to elapsedMS^2, causing a runaway feedback loop: any
        // real frame-time jitter got squared, so a slightly slow frame produced an oversized
        // step, which cost more to compute, which slowed the next frame down even further.
        let ms = t / PIXI.Ticker.targetFPMS;
        let fd = game.settings.get(MOD_NAME, SETTING_FADE_TIME);
        // step, corresponding to the module setting "fade time", also, prevent division by zero
        let step = (fd == 0) ? (this.number) : (ms * this.number) / (fd * 1000);

        if (this.faded && (this.visible > 0)) {
            // We should be faded/hidden, and we still have critters visible
            this.visible -= step;
            this.sprites.forEach((s, i) => { s.alpha = (i >= this.visible) ? 0 : 1 });
        }
        if (!this.faded && (this.visible < this.number)) {
            // We should be visible, and we still have critters hidden
            this.visible += step;
            this.sprites.forEach((s, i) => { s.alpha = (i > this.visible) ? 0 : 1 });
        }

        let currentHPPercent = this.calculateHPPercent();
        if (currentHPPercent !== this.currentHPPercent) {
            this.currentHPPercent = currentHPPercent;
            this.number = this.determineVisibleSprites(currentHPPercent, this.maxSprites);
            // Actually destroy/recreate sprites to match the number of "surviving" sprites
            this.setSpriteCount(this.number);
        }

        // Calling the animation specific method, set_destination
        this.set_destinations(ms);
        // Calling the generic move method
        this.move(ms);
    }

    hide(hidden) {
        this.faded = hidden;
    }

    destroy() {
        for (let s of this.sprites) {
            s.destroy();
        }
        // Unsubscribe from the shared canvas ticker rather than destroying it out from under every other swarm
        this.tick.remove(this.anim, this);
        this.layer.destroy();
    }

    skitter(ms) {
        this.stopMoveStop(ms);

        let pcs = canvas.tokens.placeables.filter(t => t.actor.hasPlayerOwner);
        let pcp = pcs.map(t => t.center);
        let occ = pcs.map(t => (.55 * t.w) ** 2);

        if (pcs.length > 0) {
            for (let i = 0; i < this.sprites.length; ++i) {
                let s = this.sprites[i];
                let dists2 = pcp.map(p => { return (s.x - p.x) ** 2 + (s.y - p.y) ** 2 });
                let smallest = utils.argMin(dists2);
                if (dists2[smallest] < occ[smallest]) {
                    // We are "inside" a player
                    let outx = s.x - pcp[smallest].x;
                    let outy = s.y - pcp[smallest].y;
                    let out2 = outx * outx + outy * outy;
                    if (out2 > theta) {
                        let outLen = Math.sqrt(out2);
                        let distance_left_out = 0.1 + Math.sqrt(occ[smallest]) - Math.sqrt(dists2[smallest]);
                        let scale = 1.5 * distance_left_out / outLen;
                        this.dest[i].x = s.x + outx * scale;
                        this.dest[i].y = s.y + outy * scale;
                    }
                }
            }
        }
    }

    stopMoveStop(ms) {
        for (let i = 0; i < this.sprites.length; ++i) {
            let s = this.sprites[i];
            let dx = this.dest[i].x - s.x;
            let dy = this.dest[i].y - s.y;
            if (dx * dx + dy * dy < SIGMA) {
                if (this.waiting[i] <= 0) {
                    let center = this.token.center;
                    this.dest[i].x = center.x - this.areaW / 2 + Math.random() * this.areaW;
                    this.dest[i].y = center.y - this.areaH / 2 + Math.random() * this.areaH;
                    this.waiting[i] = Math.random() * game.settings.get(MOD_NAME, SETTING_STOP_TIME) * 1000;
                }
                else {
                    this.waiting[i] -= ms;
                }
            }
        }

    }

    formSquare(ms) {
        //Calculate length and width
        let a = Math.ceil(Math.sqrt(this.sprites.length));  //Number of rows
        let b = Math.ceil(this.sprites.length / a);  //Vertical number
        let c = a - (a * b - this.sprites.length);  //last row
        let angle = this.token.document.rotation * (Math.PI / 180);
        let center = this.token.center;
        let areaX0 = center.x - this.areaW / 2;
        let areaY0 = center.y - this.areaH / 2;
        let cosA = Math.cos(angle);
        let sinA = Math.sin(angle);

        for (let i = 0; i < this.sprites.length; ++i) {
            let s = this.sprites[i];
            // Calculate the coordinate position in a square matrix
            let x = areaX0 + (this.areaW / a) * ((i - c) % a + 0.5);
            let y = areaY0 + (this.areaH / b) * (Math.floor((i - c) / a) + 1.5);
            // separate treatment for the first row
            if (c > 0 && i < c) {
                x = areaX0 + (this.areaW / c) * (i % c + 0.5);
            }

            //Rotate the square matrix following the token direction
            let x3 = (x - center.x) * cosA - (y - center.y) * sinA + center.x;
            let y3 = (x - center.x) * sinA + (y - center.y) * cosA + center.y;
            x = x3;
            y = y3;

            //Turn to the direction of the token when it is close enough to where it should be in the square.
            let dx = x - s.x;
            let dy = y - s.y;
            if (dx * dx + dy * dy < SIGMA * SIGMA) {
                s.rotation = angle;
            } else {
                this.dest[i].x = x;
                this.dest[i].y = y;
            }
        }
    }

    randSquare(ms) {
        for (let i = 0; i < this.sprites.length; ++i) {
            let s = this.sprites[i];
            let dx = this.dest[i].x - s.x;
            let dy = this.dest[i].y - s.y;
            let len2 = dx * dx + dy * dy;
            if (len2 < SIGMA * SIGMA || len2 > GAMMA * GAMMA) {
                let center = this.token.center;
                this.dest[i].x = center.x - this.areaW / 2 + Math.random() * this.areaW;
                this.dest[i].y = center.y - this.areaH / 2 + Math.random() * this.areaH;
            }
        }
    }
    spiral(ms) {
        this.t += ms / 30;
        let rx = 0.5 * this.areaW;
        let ry = 0.5 * this.areaH;
        let center = this.token.center;
        for (let i = 0; i < this.sprites.length; ++i) {
            let t = this.speeds[i] * this.t * 0.02 + this.ofsets[i];
            let x = Math.cos(t);
            let y = 0.4 * Math.sin(t);

            let ci = Math.cos(t / (2 * Math.E));
            let si = Math.sin(t / (2 * Math.E));
            this.dest[i].x = rx * (ci * x - si * y) + center.x;
            this.dest[i].y = ry * (si * x + ci * y) + center.y;
        }
    }
    circular(ms) {
        this.t += ms / 30;
        let _rx = 1 * 0.5 * this.areaW;
        let _ry = 1 * 0.5 * this.areaH;
        let center = this.token.center;

        for (let i = 0; i < this.sprites.length; ++i) {

            let t = this.t * 0.02 + this.ofsets[i];
            let rY = 1 * (0.5 + 0.5 * (
                1.0 * Math.sin(t * 0.3) +
                0.3 * Math.sin(2 * t + 0.8) +
                0.26 * Math.sin(3 * t + 0.8)
            ));
            let x = Math.cos(t * this.speeds[i]);
            let y = rY * Math.sin(t * this.speeds[i]);

            let ci = Math.cos(this.ofsets[i]);
            let si = Math.sin(this.ofsets[i]);
            let rx = _rx * (ci * x - si * y);
            let ry = _ry * (si * x + ci * y);

            this.dest[i].x = rx + center.x;
            this.dest[i].y = ry + center.y;
        }
    }

    move(ms) {
        for (let i = 0; i < this.sprites.length; ++i) {
            let s = this.sprites[i];
            let dx = this.dest[i].x - s.x;
            let dy = this.dest[i].y - s.y;
            let d2 = dx * dx + dy * dy;

            if (d2 > theta) {
                let dlen = Math.sqrt(d2);
                let speed = 0.05 * ms * this.speeds[i] * 4;
                let mvx = (dx / dlen) * speed;
                let mvy = (dy / dlen) * speed;
                if ((mvx * mvx + mvy * mvy) > d2) { mvx = dx; mvy = dy; }
                s.x += mvx;
                s.y += mvy;
                s.rotation = -Math.PI / 2. + Math.atan2(dy, dx);
            }
        }
    }
}
