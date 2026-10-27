import GLib from 'gi://GLib';
import St from 'gi://St';
import {FrostEffect} from './frostEffect.js';
import {shellSurfaceKind, shellSurfaceRole, surfacePalette} from './materials.js';
import {surfaceOpacity, panelIsDark} from './experience.js';

// Event-driven discovery also covers menus/docks created after Polished is enabled.
export class ShellSurfaces {
    constructor(root, panel, isDark, permitted, redrawGuard, context) {
        this._context = context;
        this._redrawGuard = redrawGuard;
        this._panel = panel;
        this._isDark = isDark;
        this._permitted = permitted;
        this._watched = new Map();
        this._applied = new Map();
        this._parents = new Map();
        this._destroying = false;
        this._source = 0;
        this._watch(root);
        this._watch(panel);
        this.refresh();
    }

    _watch(actor, parent = null) {
        if (this._watched.has(actor)) return;
        const ids = [];
        this._watched.set(actor, ids);
        this._parents.set(actor, parent);
        ids.push(actor.connect('child-added', (_actor, child) => {
            this._watch(child, actor);
            this._queue();
        }));
        ids.push(actor.connect('child-removed', (_actor, child) => {
            this._unwatch(child);
            this._queue();
        }));
        ids.push(actor.connect('destroy', () => this._forget(actor)));
        ids.push(actor.connect('notify::mapped', () => {
            const effect = this._applied.get(actor)?.effect;
            if (effect && actor.is_mapped?.()) effect.invalidateBackdrop();
        }));
        // Non-St actors have no theme/style properties.
        if (typeof actor.get_style_class_name === 'function') {
            ids.push(actor.connect('notify::style-class', () => { if (!this._settingStyle) this._queue(); }));
            ids.push(actor.connect('notify::name', () => this._queue()));
            const changed = () => {
                // Hovering a label/row must not rescan the entire Shell tree.
                // Our own writes already have the intended state applied.
                if (this._settingStyle) return;
                const classes = actor.get_style_class_name?.() ?? '';
                if (actor === this._panel || this._applied.has(actor) ||
                    shellSurfaceKind(classes) || shellSurfaceRole(classes)) this._queue();
            };
            ids.push(actor.connect('notify::style', changed));
            ids.push(actor.connect('style-changed', () => {
                if (this._settingStyle) return;
                const saved = this._applied.get(actor);
                // Inherited hover/focus/font notifications do not change our
                // material. Only a surface's actual shape needs a new pass.
                if (!saved || saved.role !== 'surface' || actor === this._panel) return;
                if (JSON.stringify(this._radii(actor, saved.kind)) !== saved.radiiKey) this._queue();
            }));
        }
        for (const child of actor.get_children()) this._watch(child, actor);
    }

    _queue() {
        if (this._destroying || this._source) return;
        this._source = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._source = 0;
            this.refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _restore(actor) {
        const saved = this._applied.get(actor);
        if (!saved) return;
        this._redrawGuard?.untrack(actor);
        if (saved.effect) actor.remove_effect(saved.effect);
        this._syncClass(actor, saved, null);
        // Preserve an external extension's later inline change, if there is one.
        if (actor.get_style() === saved.appliedStyle) {
            this._settingStyle = true;
            try { actor.set_style(saved.style); }
            finally { this._settingStyle = false; }
        }
        this._applied.delete(actor);
        actor._border?.queue_repaint?.();
    }

    _forget(actor) {
        this._restore(actor);
        for (const id of this._watched.get(actor) ?? []) actor.disconnect(id);
        this._watched.delete(actor);
        this._parents.delete(actor);
    }

    _syncClass(actor, saved, name) {
        if (saved.materialClass === name) return;
        this._settingStyle = true;
        try {
            if (saved.ownsClass) actor.remove_style_class_name(saved.materialClass);
            saved.materialClass = name;
            saved.ownsClass = Boolean(name && !actor.has_style_class_name(name));
            if (saved.ownsClass) actor.add_style_class_name(name);
        } finally { this._settingStyle = false; }
    }

    _unwatch(actor) {
        for (const child of actor.get_children()) this._unwatch(child);
        this._forget(actor);
    }

    _hasMenuSurface(actor) {
        for (const child of actor.get_children()) {
            const classes = child.get_style_class_name?.() ?? '';
            if (shellSurfaceKind(classes) === 'menus' && shellSurfaceRole(classes) === 'surface') return true;
            if (this._hasMenuSurface(child)) return true;
        }
        return false;
    }

    _describe(actor) {
        if (actor === this._panel) return {kind: 'panel', role: 'surface'};
        const classes = actor.get_style_class_name?.() ?? '';
        const role = shellSurfaceRole(classes);
        const kind = shellSurfaceKind(classes);
        if (role === 'pointer') return {kind, role: this._hasMenuSurface(actor) ? 'pointer' : 'pointer-fill'};
        if (kind === 'menus' && classes.split(/\s+/).includes('popup-sub-menu')) {
            // Expanding rows live inside an already painted menu. A second
            // material there compounds opacity and repeats the blur pass.
            // A BoxPointer boundary starts a separate floating popup instead.
            for (let parent = this._parents.get(actor); parent; parent = this._parents.get(parent)) {
                const parentClasses = parent.get_style_class_name?.() ?? '';
                const parentRole = shellSurfaceRole(parentClasses);
                if (parentRole === 'pointer') break;
                if (shellSurfaceKind(parentClasses) === 'menus' && parentRole === 'surface')
                    return {kind, role: 'inset'};
            }
        }
        if (kind) return {kind, role};
        // Color actual text/icons only. Workspace dots and layout/drawing
        // widgets rely on their native theme geometry and must stay untouched.
        for (let parent = this._parents.get(actor); parent; parent = this._parents.get(parent)) {
            if (parent === this._panel) return actor instanceof St.Label || actor instanceof St.Icon
                ? {kind: 'panel', role: 'foreground'} : {kind: null, role: null};
            if (shellSurfaceKind(parent.get_style_class_name?.() ?? '')) break;
        }
        if (role === 'inset') {
            // Only clear cards inside a menu/banner; never globally flatten UI cards.
            for (let parent = this._parents.get(actor); parent; parent = this._parents.get(parent)) {
                const owner = shellSurfaceKind(parent.get_style_class_name?.() ?? '');
                if (owner === 'menus' || owner === 'notifications') return {kind: owner, role};
            }
        }
        return {kind: null, role: null};
    }

    _radii(actor, kind) {
        // St reports the theme's actual per-corner radii. If shape is unknown,
        // prefer no blur to painting a rectangle outside a rounded surface.
        if (typeof actor.get_theme_node !== 'function') return kind === 'panel' ? [0, 0, 0, 0] : null;
        if (actor.get_stage && !actor.get_stage()) return null;
        try {
            const node = actor.get_theme_node();
            return [0, 1, 2, 3].map(corner => Math.max(0, node.get_border_radius(corner)));
        } catch {
            return null;
        }
    }

    setMotionPaused(paused) {
        if (Boolean(this._motionPaused) === paused) return;
        this._motionPaused = paused;
        for (const [actor, saved] of this._applied) {
            this._redrawGuard?.track(actor, Boolean(saved.effect) && !paused);
        }
    }

    refreshBackdrops() {
        for (const saved of this._applied.values())
            if (saved.effect) saved.effect.invalidateBackdrop();
    }

    refresh() {
        const active = this._permitted();
        const dark = this._isDark();
        const context = this._context();
        const palette = surfacePalette(dark);
        const tint = palette.background;
        const alpha = Math.max(40, Math.min(100, context.shellOpacity)) / 100;
        const panelAlpha = Math.max(context.smoothPerformance ? 72 : 0, Math.min(100, context.panelOpacity)) / 100;
        const panelTint = palette.background;
        const panelDark = panelIsDark(dark, panelAlpha, context.luminance);
        const panelForeground = panelDark ? '246,247,249' : '16,20,26';
        for (const actor of this._watched.keys()) {
            if (typeof actor.get_style !== 'function') continue;
            const {kind, role} = this._describe(actor);
            if (!active || !kind) {
                this._restore(actor);
                continue;
            }
            let saved = this._applied.get(actor);
            if (saved && saved.role !== role) { this._restore(actor); saved = null; }
            if (!saved) {
                saved = {style: actor.get_style(), role, effect: null, type: null};
                this._applied.set(actor, saved);
            } else if (actor.get_style() !== saved.appliedStyle) {
                saved.style = actor.get_style();
            }
            this._syncClass(actor, saved, role === 'surface' && kind !== 'panel'
                ? `polished-material-${kind === 'overlays' || dark ? 'dark' : 'light'}`
                : actor === this._panel ? `polished-panel-${panelDark ? 'dark' : 'light'}` : null);
            const radii = role === 'surface' ? this._radii(actor, kind) : null;
            saved.kind = kind;
            saved.radiiKey = JSON.stringify(radii);
            // The top bar and short-lived overlays are tint-only. Unknown
            // native shapes also keep tint rather than risk rectangular edges.
            const glass = !context.smoothPerformance &&
                (kind === 'dock' ? context.dockGlass !== false : context.menuGlass !== false);
            const type = glass && role === 'surface' && kind !== 'panel' && kind !== 'overlays' && radii ? 'frost' : null;
            if (saved.type !== type) {
                if (saved.effect) actor.remove_effect(saved.effect);
                saved.effect = type ? new FrostEffect() : null;
                saved.type = type;
                saved.paintKey = null;
                if (saved.effect) actor.add_effect(saved.effect);
            }
            if (saved.effect) {
                // St offscreen textures include transparent layout margins and
                // shadow extents. Glass must follow the native painted alpha,
                // not fill the actor's entire rounded allocation behind them.
                saved.effect.nativeShape = true;
                saved.effect.radii = radii;
                saved.effect.radius = 36;
                saved.effect.brightness = dark ? 0.85 : 1;
                saved.effect.veil = [...(dark ? [0.10, 0.11, 0.14] : [0.94, 0.95, 0.97]), context.detail / 100];
                const paintKey = JSON.stringify([radii, saved.effect.brightness, saved.effect.veil]);
                if (saved.paintKey !== paintKey) {
                    saved.paintKey = paintKey;
                    actor.queue_redraw?.();
                }
            }
            this._redrawGuard?.track(actor, Boolean(saved.effect) && !this._motionPaused);
            // Theme !important rules (notably Yaru #panel) otherwise keep opaque paint.
            // BoxPointer paints its own Cairo background beneath popup-menu-content.
            // Without blur, denser fills keep wallpaper detail from competing
            // with labels. The top bar retains its wallpaper-aware contrast.
            const materialAlpha = !glass
                ? Math.max(0.94, surfaceOpacity(kind, alpha)) : surfaceOpacity(kind, alpha);
            const background = role === 'surface'
                ? (kind === 'panel' ? `rgba(${panelTint},${panelAlpha})`
                    : `rgba(${kind === 'overlays' ? surfacePalette(true).background : tint},${materialAlpha})`) : 'transparent';
            const pointer = role === 'pointer' ? '-arrow-background-color: transparent !important;'
                : role === 'pointer-fill' ? `-arrow-background-color: rgba(${tint},${materialAlpha}) !important;` : '';
            const base = saved.style?.trim() ?? '';
            // Native OSD levels and switcher rows use a light foreground even
            // in light mode; keep their backing dark and their colors intact.
            const foreground = role === 'foreground' ? `color: rgb(${panelForeground}) !important;`
                : role === 'surface' && kind !== 'panel'
                    ? `color: rgb(${surfacePalette(kind === 'overlays' || dark).foreground}) !important;` : '';
            const font = role === 'surface' ? palette.fontStyle : '';
            const fill = role === 'foreground' ? ''
                : `background-image: none !important; background-color: ${background} !important; ${pointer}`;
            // An inset rim is visible even when the dock theme has zero border
            // width. It follows native radii without changing allocation, icon
            // spacing, input regions or adding another capture/effect actor.
            const edge = role === 'surface' && kind === 'dock'
                ? `border-color: transparent; box-shadow: inset 0 0 0 1px rgba(${palette.edge}) !important;`
                : role === 'surface' && kind !== 'panel'
                    ? `border-color: rgba(${kind === 'overlays' ? surfacePalette(true).edge : palette.edge}); box-shadow: 0 ${kind === 'overlays' ? '4px 12px' : '6px 18px'} 0 rgba(0,0,0,${kind === 'overlays' || dark ? 0.24 : 0.14});` : '';
            saved.appliedStyle = `${base}${base && !base.endsWith(';') ? ';' : ''} ${fill} ${foreground} ${edge} ${font}`;
            if (actor.get_style() !== saved.appliedStyle) {
                this._settingStyle = true;
                try { actor.set_style(saved.appliedStyle); }
                finally { this._settingStyle = false; }
                actor._border?.queue_repaint?.();
            }
        }
    }

    destroy() {
        this._destroying = true;
        if (this._source) GLib.source_remove(this._source);
        for (const actor of [...this._watched.keys()]) this._forget(actor);
        this._panel = null;
        this._isDark = null;
        this._permitted = null;
        this._context = null;
    }
}
