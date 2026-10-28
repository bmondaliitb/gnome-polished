import GLib from 'gi://GLib';
import St from 'gi://St';
import {surfacePalette} from './materials.js';

// Reuse GNOME's wallpaper actors and their existing native blur. Never capture
// session windows or modify authentication, focus, gestures, or entry opacity.
export class LockMaterial {
    constructor(shield, permitted, context = () => ({})) {
        this._shield = shield;
        this._permitted = permitted;
        this._context = context;
        this._effects = new Map();
        this._dialogSignals = [];
        this._theme = St.ThemeContext.get_for_stage(global.stage);
        this._signals = [];
        if (shield) {
            for (const signal of ['lock-screen-shown', 'locked-changed', 'active-changed'])
                this._signals.push([shield, shield.connect(signal, () => this.refresh())]);
        }
        this._signals.push([this._theme, this._theme.connect('notify::scale-factor', () => this._queue())]);
        this.refresh();
    }

    _queue() {
        if (this._source) return;
        this._source = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._source = 0;
            this.refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    refresh() {
        const dialog = this._shield?._dialog;
        if (!this._permitted() ||
            !dialog?._backgroundGroup || !dialog?._promptBox) {
            this._clear();
            return;
        }
        if (this._dialog !== dialog) {
            this._clear();
            this._dialog = dialog;
            this._ownsClass = !dialog.has_style_class_name('polished-lock-material');
            if (this._ownsClass) dialog.add_style_class_name('polished-lock-material');
            this._prompt = dialog._promptBox;
            this._dialogSignals = [
                [dialog, dialog.connect('destroy', () => this._clear())],
                [this._prompt, this._prompt.connect('notify::visible', () => this.refresh())],
                [dialog._backgroundGroup, dialog._backgroundGroup.connect('child-added', () => this._queue())],
            ];
        }
        const palette = surfacePalette(true);
        const context = this._context();
        const alpha = Math.max(0.60, Math.min(0.94, (context.shellOpacity ?? 76) / 100 - 0.12));
        if (dialog.get_style() !== this._dialogAppliedStyle) this._dialogStyle = dialog.get_style();
        const dialogBase = this._dialogStyle?.trim() ?? '';
        this._dialogAppliedStyle = `${dialogBase}${dialogBase && !dialogBase.endsWith(';') ? ';' : ''} ${palette.fontStyle}`;
        if (dialog.get_style() !== this._dialogAppliedStyle) dialog.set_style(this._dialogAppliedStyle);
        if (this._prompt.get_style() !== this._appliedStyle) this._style = this._prompt.get_style();
        const base = this._style?.trim() ?? '';
        this._appliedStyle = `${base}${base && !base.endsWith(';') ? ';' : ''} background-color: rgba(${palette.background},${context.smoothPerformance || context.menuGlass === false ? 0.94 : alpha}); border-radius: 24px; padding: 24px; border: 1px solid rgba(${palette.edge}); border-top-color: rgba(${palette.glassEdge}); color: rgb(${palette.foreground});`;
        if (this._prompt.get_style() !== this._appliedStyle) this._prompt.set_style(this._appliedStyle);
        const prompting = this._prompt.visible;
        for (const actor of dialog._backgroundGroup.get_children()) {
            const effect = actor.get_effect('blur');
            let saved = this._effects.get(actor);
            if (saved && saved.effect !== effect) {
                this._restoreEffect(actor, saved);
                this._effects.delete(actor);
                saved = null;
            }
            if (!effect) continue;
            if (!saved) {
                saved = {effect, radius: effect.radius, brightness: effect.brightness,
                    destroyId: actor.connect('destroy', () => this._effects.delete(actor))};
                this._effects.set(actor, saved);
            }
            // Native monitor/scale updates may reset these properties. Preserve
            // the latest native values so opt-out restores the correct scale.
            if (effect.radius !== saved.appliedRadius) saved.radius = effect.radius;
            if (effect.brightness !== saved.appliedBrightness) saved.brightness = effect.brightness;
            saved.appliedRadius = prompting && !context.smoothPerformance && context.menuGlass !== false
                ? 18 * this._theme.scale_factor : 0;
            saved.appliedBrightness = prompting ? 0.78 : 1;
            if (effect.radius !== saved.appliedRadius) effect.radius = saved.appliedRadius;
            if (effect.brightness !== saved.appliedBrightness) effect.brightness = saved.appliedBrightness;
        }
    }

    _restoreEffect(actor, saved) {
        if (saved.effect.radius === saved.appliedRadius) saved.effect.radius = saved.radius;
        if (saved.effect.brightness === saved.appliedBrightness) saved.effect.brightness = saved.brightness;
        actor.disconnect(saved.destroyId);
    }

    _clear() {
        for (const [object, id] of this._dialogSignals) object.disconnect(id);
        this._dialogSignals = [];
        if (this._prompt && this._prompt.get_style() === this._appliedStyle) this._prompt.set_style(this._style);
        if (this._dialog) {
            if (this._dialog.get_style() === this._dialogAppliedStyle) this._dialog.set_style(this._dialogStyle);
            if (this._ownsClass) this._dialog.remove_style_class_name('polished-lock-material');
        }
        this._ownsClass = false;
        this._dialogStyle = this._dialogAppliedStyle = null;
        this._prompt = this._dialog = null;
        this._style = this._appliedStyle = null;
        for (const [actor, saved] of this._effects) {
            this._restoreEffect(actor, saved);
        }
        this._effects.clear();
    }

    destroy() {
        if (this._source) GLib.source_remove(this._source);
        this._source = 0;
        for (const [object, id] of this._signals) object.disconnect(id);
        this._signals = [];
        this._clear();
    }
}
