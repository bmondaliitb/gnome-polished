import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import {surfacePalette} from './materials.js';
import {VisualBackdrop} from './backdrop.js';

// Smooth mode keeps GNOME's overview rendering and adds only scoped styling.
// Glass mode owns separate wallpaper actors with cached ACTOR-mode blur; it
// never captures session windows or blurs the controls.
export class OverviewMaterial {
    constructor(layout, permitted, context) {
        this._layout = layout;
        this._root = layout.overviewGroup;
        this._permitted = permitted;
        this._context = context;
        this._managers = [];
        this._records = new Map();
        this._signals = [
            [this._root, this._root.connect('notify::visible', () => this.refresh())],
            [this._root, this._root.connect('notify::style', () => { if (!this._writing) this.refresh(); })],
            [layout, layout.connect('monitors-changed', () => {
                if (!this._smooth) { this._clear(); this.refresh(); }
            })],
        ];
        this.refresh();
    }

    refresh() {
        if (!this._permitted()) {
            this._clear();
            return;
        }
        const smooth = Boolean(this._context().smoothPerformance || this._context().overviewGlass === false);
        if (this._styled && this._smooth !== smooth) this._clear();
        if (!this._styled && !this._root.visible) return;
        if (!this._styled) {
            this._style = this._root.get_style();
            this._ownsSearchClass = !this._root.has_style_class_name('polished-overview-material');
            this._root.add_style_class_name('polished-overview-material');
            this._styled = true;
        } else if (this._root.get_style() !== this._appliedStyle) {
            this._style = this._root.get_style();
        }
        this._smooth = smooth;
        if (smooth) {
            if (!this._root.has_style_class_name('polished-overview-smooth')) {
                this._root.add_style_class_name('polished-overview-smooth');
                this._ownsSmoothClass = true;
            }
        } else if (this._ownsSmoothClass) {
            this._root.remove_style_class_name('polished-overview-smooth');
            this._ownsSmoothClass = false;
        }
        const base = this._style?.trim() ?? '';
        const background = smooth ? '' : 'background-color: transparent !important; background-image: none !important;';
        this._appliedStyle = `${base}${base && !base.endsWith(';') ? ';' : ''} ${surfacePalette(true).fontStyle} ${background}`;
        if (this._root.get_style() !== this._appliedStyle) {
            this._writing = true;
            try { this._root.set_style(this._appliedStyle); }
            finally { this._writing = false; }
        }
        if (smooth) return;
        if (!this._layer) {
            this._layer = new VisualBackdrop({reactive: false, can_focus: false, track_hover: false});
            this._layer.add_constraint(new Clutter.BindConstraint({source: this._root, coordinate: Clutter.BindCoordinate.ALL}));
            this._root.insert_child_at_index(this._layer, 0);
            for (let index = 0; index < this._layout.monitors.length; index++) {
                const manager = new Background.BackgroundManager({container: this._layer,
                    layoutManager: this._layout, monitorIndex: index, controlPosition: true});
                manager.connect('changed', () => this._background(manager.backgroundActor));
                this._managers.push(manager);
            }
            this._tint = new VisualBackdrop({reactive: false, can_focus: false, track_hover: false});
            this._tint.add_constraint(new Clutter.BindConstraint({source: this._layer, coordinate: Clutter.BindCoordinate.ALL}));
            this._layer.add_child(this._tint);
        }
        // GNOME's overview labels use a light foreground even in light mode.
        // Keep a dark neutral veil rather than restyling every app/search label.
        const opacity = Math.max(0, Math.min(100, this._context().overviewOpacity)) / 100;
        const tint = `background-color: rgba(20,23,30,${opacity});`;
        if (this._tint.get_style() !== tint) this._tint.set_style(tint);
        for (const manager of this._managers) this._background(manager.backgroundActor);
    }

    _background(actor) {
        if (!actor) return;
        let record = this._records.get(actor);
        if (!record) {
            record = {effect: null, destroyId: actor.connect('destroy', () => this._records.delete(actor))};
            this._records.set(actor, record);
        }
        actor.reactive = false;
        actor.content.brightness = 0.65;
        if (!record.effect) {
            record.effect = new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR});
            actor.add_effect(record.effect);
        }
        record.effect.radius = 18;
        record.effect.brightness = 1;
    }

    _clear() {
        if (this._ownsSearchClass) this._root.remove_style_class_name('polished-overview-material');
        this._ownsSearchClass = false;
        if (this._ownsSmoothClass) this._root.remove_style_class_name('polished-overview-smooth');
        this._ownsSmoothClass = false;
        for (const [actor, record] of this._records) {
            if (record.effect) actor.remove_effect(record.effect);
            actor.disconnect(record.destroyId);
        }
        this._records.clear();
        for (const manager of this._managers) manager.destroy();
        this._managers = [];
        this._layer?.destroy();
        this._layer = this._tint = null;
        if (this._appliedStyle && this._root.get_style() === this._appliedStyle) {
            this._writing = true;
            try { this._root.set_style(this._style); }
            finally { this._writing = false; }
        }
        this._appliedStyle = null;
        this._styled = false;
        this._smooth = undefined;
    }

    destroy() {
        for (const [object, id] of this._signals) object.disconnect(id);
        this._signals = [];
        this._clear();
    }
}
