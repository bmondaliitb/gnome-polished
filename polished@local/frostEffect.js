import GLib from 'gi://GLib';
import {snapshotBudget, CaptureMetrics} from './captureResources.js';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import {FROST_DECLARATIONS, FROST_CODE} from './frostShader.js';

import {BlurBuffer} from './frostBlur.js';
import {framebufferCapture} from './frostGeometry.js';

const metrics = new CaptureMetrics(() => GLib.get_monotonic_time());
let workspaceMotion = false;
let interactiveMotion = false;

// Capture the background BEFORE the actor is redirected offscreen. A mask wrapped
// around Shell.BlurEffect alone can capture an empty offscreen buffer instead.
export const FrostEffect = GObject.registerClass({GTypeName: 'PolishedRoundedFrostEffect'},
class FrostEffect extends Shell.GLSLEffect {
    static get metrics() { return metrics; }
    static configureDiagnostics(enabled) { metrics.configure(enabled); }
    static setWorkspaceMotion(active) { workspaceMotion = active; }
    static setInteractiveMotion(active) { interactiveMotion = active; }

    _init() {
        super._init();
        this.radius = 36;
        this.brightness = 1;
        this.radii = [0, 0, 0, 0];
        this.veil = [0.10, 0.11, 0.14, 0.25];
        this.nativeShape = false;
        this.clientTintOpacity = 1;
        this._cacheVersion = 0;
        this._sources = new Map();
        this._capture = null;
        this._texture = null;
        this._framebuffer = null;
        this._logged = false;
        this._blurBuffer = null;
        this._blurred = null;
        this._uniforms = new Map();
        this._uniformValues = new Map();
        this._pendingCapture = true;
        this.captureAllowed = false;
        this.captureChanged = null;
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, FROST_DECLARATIONS, FROST_CODE, false);
    }

    get needsCapture() { return this._pendingCapture; }

    _setPending(pending, request = false) {
        if (this._pendingCapture === pending) {
            if (request) this.captureChanged?.();
            return;
        }
        this._pendingCapture = pending;
        this.captureChanged?.();
    }

    invalidateBackdrop() {
        this._cacheVersion++;
        this._setPending(true, true);
        this.queue_repaint();
    }

    trimSnapshots() { snapshotBudget.trim(); }

    releaseSnapshots() {
        for (const entry of [...this._sources.values()]) this.releaseSnapshot(entry);
    }

    canReleaseSnapshot(_entry) {
        return !workspaceMotion && !interactiveMotion && !this.get_actor()?.is_mapped?.();
    }

    releaseSnapshot(entry) {
        for (const [source, cached] of this._sources) {
            if (cached !== entry) continue;
            this._sources.delete(source);
            snapshotBudget.forget(entry.token);
        }
        if (this._boundBackdrop === entry.blurred) {
            this._uniformPipeline?.set_layer_texture(1, null);
            this._boundBackdrop = null;
        }
        if (this._texture !== entry.texture) return;
        this._capture = this._texture = this._framebuffer = this._blurBuffer = this._blurred = null;
        // Do not queue a hidden actor. Its next visible paint requests a capture.
        this._pendingCapture = true;
    }

    _report(error) {
        if (!this._logged) console.error('Polished: rounded frost fell back to native translucent paint', error);
        this._logged = true;
    }

    vfunc_pick(context) {
        // Visual alpha/masking must never become an input mask or stop traversal.
        this.get_actor().continue_pick(context);
    }

    vfunc_paint(node, context, flags) {
        // Capture separately from foreground redirection. Forcing ACTOR_DIRTY
        // used to redraw large, unchanged foreground textures on every frame.
        if (flags & Clutter.EffectPaintFlags.BYPASS_EFFECT) this._capture = null;
        else if (!workspaceMotion && !this.get_actor().is_in_clone_paint?.() &&
            (!interactiveMotion || !this._capture))
            this._updateBackdrop(context);
        // Workspace/other clone paints reuse the already cached material.
        super.vfunc_paint(node, context, flags);
    }

    _updateBackdrop(context) {
        const previous = {capture: this._capture, texture: this._texture,
            framebuffer: this._framebuffer, blurBuffer: this._blurBuffer, blurred: this._blurred};
        this._capture = null;
        try {
            const actor = this.get_actor();
            const source = context.get_framebuffer();
            const [width, height] = actor.get_size();
            if (width <= 0 || height <= 0) return false;
            const capture = framebufferCapture(source, width, height);
            if (!capture) return false;
            const {rect} = capture;
            const signature = JSON.stringify([rect, capture.basis, capture.origin,
                capture.scale, this.radius, this._cacheVersion]);
            let cached = this._sources.get(source);
            // Separate storage avoids reallocating a single capture repeatedly
            // when a window straddles differently scaled monitor framebuffers.
            if (cached) {
                this._texture = cached.texture;
                this._framebuffer = cached.framebuffer;
                this._blurBuffer = cached.blurBuffer;
                this._blurred = cached.blurred;
                if (cached.signature === signature) {
                    this._capture = capture;
                    snapshotBudget.touch(cached.token);
                    metrics.hit();
                    this._setPending(false);
                    return true;
                }
            } else {
                this._texture = this._framebuffer = this._blurBuffer = null;
            }
            if (this.captureChanged && !this.captureAllowed) {
                // A transform/size change may first be observed during paint.
                // Reuse the old snapshot for this frame and request a complete
                // backing frame before copying; never read a partial damage tile.
                this._texture = previous.texture;
                this._framebuffer = previous.framebuffer;
                this._blurBuffer = previous.blurBuffer;
                this._blurred = previous.blurred;
                this._capture = previous.capture;
                this._setPending(true, true);
                return Boolean(this._capture);
            }
            const started = metrics.start();
            // Capture only the effect's bounds. Allocation padding can reach
            // outside the region repainted by Mutter; filtering those pixels
            // leaks stale framebuffer tiles into an otherwise current backdrop.
            if (!this._texture || this._texture.get_width() !== rect.width || this._texture.get_height() !== rect.height) {
                this._texture = Cogl.Texture2D.new_with_size(source.get_context(), rect.width, rect.height);
                this._framebuffer = Cogl.Offscreen.new_with_texture(this._texture);
                this._framebuffer.allocate();
            }
            const copied = source.blit(this._framebuffer, rect.x, rect.y, 0, 0, rect.width, rect.height);
            if (copied === false) throw new Error('Backdrop framebuffer copy failed');
            if (!this._blurBuffer) this._blurBuffer = new BlurBuffer(source.get_context());
            const radius = Math.max(0, Math.min(80, this.radius)) * capture.scale;
            this._blurred = radius > 0 ? this._blurBuffer.render(this._texture, radius) : this._texture;
            this._capture = capture;
            if (cached) snapshotBudget.forget(cached.token);
            cached = {signature, texture: this._texture,
                framebuffer: this._framebuffer, blurBuffer: this._blurBuffer, blurred: this._blurred};
            this._sources.set(source, cached);
            cached.token = snapshotBudget.retain(this, cached,
                rect.width * rect.height * 4 + (this._blurBuffer.estimatedBytes ?? 0));
            if (this._sources.size > 4) this.releaseSnapshot(this._sources.values().next().value);
            metrics.captured(started, snapshotBudget.trim());
            this._setPending(false);
            return true;
        } catch (error) {
            this._setPending(false);
            this._report(error);
            return false;
        }
    }

    vfunc_paint_target(node, context) {
        const pipeline = this.get_pipeline();
        if (this._uniformPipeline !== pipeline) {
            this._uniformPipeline = pipeline;
            this._uniforms.clear();
            this._uniformValues.clear();
            this._boundBackdrop = null;
            pipeline.set_layer_combine(1, 'RGBA = REPLACE (PREVIOUS)');
            pipeline.set_layer_filters(1, Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR);
            pipeline.set_layer_wrap_mode(1, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
            pipeline.set_blend('RGBA = ADD (SRC_COLOR, DST_COLOR * (1-SRC_COLOR[A]))');
        }
        const uniform = (name, components, values) => {
            const previous = this._uniformValues.get(name);
            if (previous && values.every((value, index) => value === previous[index])) return;
            // Pipeline.set_uniform_float has an explicit vector count in GJS.
            if (!this._uniforms.has(name)) this._uniforms.set(name, pipeline.get_uniform_location(name));
            pipeline.set_uniform_float(this._uniforms.get(name), components, 1, values);
            this._uniformValues.set(name, [...values]);
        };
        let active = false;
        try {
            if (this._capture) {
                const actor = this.get_actor();
                const [width, height] = actor.get_size();
                const texture = this.get_texture();
                const resourceScale = actor.get_resource_scale();
                const texWidth = texture.get_width() / resourceScale;
                const texHeight = texture.get_height() / resourceScale;
                const {rect, basis, origin} = this._capture;
                // This effect owns its per-instance GLSL pipeline, including layer 1.
                if (this._boundBackdrop !== this._blurred) {
                    pipeline.set_layer_texture(1, this._blurred);
                    this._boundBackdrop = this._blurred;
                }
                uniform('polishedSize', 2, [Math.max(1, width), Math.max(1, height)]);
                uniform('polishedTexSize', 2, [texWidth, texHeight]);
                uniform('polishedPadding', 2, [(texWidth - width) / 2, (texHeight - height) / 2]);
                uniform('polishedRadii', 4, this.radii);
                uniform('polishedBasis', 4, basis);
                uniform('polishedOrigin', 2, origin);
                uniform('polishedBackdropSize', 2, [rect.width, rect.height]);
                uniform('polishedOpacity', 1, [actor.get_paint_opacity() / 255]);
                uniform('polishedBrightness', 1, [this.brightness]);
                uniform('polishedVeil', 4, this.veil);
                uniform('polishedNativeShape', 1, [this.nativeShape ? 1 : 0]);
                uniform('polishedNativeTintOpacity', 1, [this.clientTintOpacity]);
                active = true;
            }
        } catch (error) {
            this._report(error);
        }
        uniform('polishedActive', 1, [active ? 1 : 0]);
        super.vfunc_paint_target(node, context);
    }
});
