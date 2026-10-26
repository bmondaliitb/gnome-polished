import GLib from 'gi://GLib';
import St from 'gi://St';

// Reuse GNOME's wallpaper actors and their existing native blur. Never capture
// session windows or modify authentication, focus, gestures, or entry opacity.
export class LockMaterial {
    constructor(shield, permitted) {
        this._shield = shield;
        this._permitted = permitted;
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
            this._prompt = dialog._promptBox;
            this._dialogSignals = [
                [dialog, dialog.connect('destroy', () => this._clear())],
                [this._prompt, this._prompt.connect('notify::visible', () => this.refresh())],
                [dialog._backgroundGroup, dialog._backgroundGroup.connect('child-added', () => this._queue())],
            ];
        }
        if (this._prompt.get_style() !== this._appliedStyle) this._style = this._prompt.get_style();
        const base = this._style?.trim() ?? '';
        this._appliedStyle = `${base}${base && !base.endsWith(';') ? ';' : ''} background-color: rgba(25,28,35,0.70); border-radius: 28px; padding: 24px; border: 1px solid rgba(255,255,255,0.14);`;
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
            saved.appliedRadius = prompting ? 18 * this._theme.scale_factor : 0;
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
