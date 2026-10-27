import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {eligible, materialStyle, configureMaterials, surfacePalette} from './materials.js';

import {VisualBackdrop} from './backdrop.js';
import {BackdropRefreshEffect} from './backdropRefreshEffect.js';
import {RedrawGuard} from './redrawGuard.js';
import {clientSurfaceRoot} from './windowSurface.js';
import {FrostEffect} from './frostEffect.js';
import {GtkMenuStyle, gtkMenuCss} from './gtkMenus.js';
import {ShellSurfaces} from './shellSurfaces.js';
import {Experience, comfortPolicy} from './experience.js';
import {OverviewMaterial} from './overviewMaterial.js';
import {LockMaterial} from './lockMaterial.js';
import {readDesktopStyle} from './polish.js';
import {arrangeWindow} from './windowLayout.js';
import {WorkspaceResume} from './workspaceResume.js';
import {initializeProfile, materialValues} from './simpleProfile.js';

export default class Polished extends Extension {
    enable() {
        const prism = Main.extensionManager?.lookup('prism@local');
        if (prism && [ExtensionState.ACTIVE, ExtensionState.ACTIVATING].includes(prism.state))
            throw new Error('Disable Prism Materials before enabling Polished Desktop.');
        this._settings = this.getSettings();
        initializeProfile(this._settings);
        FrostEffect.configureDiagnostics?.(this._settings.get_boolean('capture-diagnostics'));
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        configureMaterials(readDesktopStyle(this._interface));
        this._connections = [];
        this._windows = new Map();
        this._workspaceMotion = false;
        this._motionSignal = 0;
        this._workspaceSettling = false;
        this._workspaceDirtyWindows = new Set();
        this._workspaceFullRefresh = false;
        this._workspaceResume = new WorkspaceResume(global.stage, () => this._finishWorkspaceMotion());
        this._layoutBindings = [];
        for (const [name, resize] of [['polished-center-window', false], ['polished-comfortable-window', true]]) {
            Main.wm.addKeybinding(name, this._settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, () => {
                if (this._settings.get_boolean('enabled') && !Main.sessionMode.isLocked)
                    arrangeWindow(global.display.focus_window, resize, Meta.WindowType.NORMAL);
            });
            this._layoutBindings.push(name);
        }
        this._redrawGuard = new RedrawGuard(() => global.stage.queue_redraw(), undefined, undefined, FrostEffect.metrics);
        this._gtkMenus = new GtkMenuStyle();
        this._gtkCss = undefined;
        this._button = new PanelMenu.Button(0.0, 'Polished Materials');
        this._button.add_child(new St.Icon({icon_name: 'weather-fog-symbolic', style_class: 'system-status-icon'}));
        this._toggle = new PopupMenu.PopupSwitchMenuItem('Polished materials', this._settings.get_boolean('enabled'));
        this._toggle.connect('toggled', (_item, state) => this._settings.set_boolean('enabled', state));
        this._button.menu.addMenuItem(this._toggle);
        this._button.menu.addAction('Refresh cached backgrounds', () => {
            for (const state of this._windows.values()) {
                state.effect?.invalidateBackdrop?.();
                state.popupEffect?.invalidateBackdrop?.();
            }
            this._shellSurfaces?.refreshBackdrops();
            global.stage.queue_redraw();
        });
        this._button.menu.addAction('Desktop appearance', async () => {
            if (Main.sessionMode.isLocked) return;
            try { await this.openPreferences(); }
            catch (error) { console.error('Polished: could not open preferences', error); }
        });
        Main.panel.addToStatusArea(this.uuid, this._button);
        this._connect(this._settings, 'changed', (_settings, key) => {
            if (key === 'capture-diagnostics') {
                FrostEffect.configureDiagnostics?.(this._settings.get_boolean(key));
                return;
            }
            if (key?.startsWith('polished-')) return;
            this._toggle.setToggleState(this._settings.get_boolean('enabled'));
            this._syncMotionTracking();
            this._syncGtkMenus();
            this._refresh();
        });
        this._connect(this._interface, 'changed::color-scheme', () => { this._syncGtkMenus(); this._refresh(); });
        for (const key of ['font-name', 'accent-color']) {
            if (this._interface.settings_schema?.has_key(key))
                this._connect(this._interface, `changed::${key}`, () => {
                    configureMaterials(readDesktopStyle(this._interface));
                    this._syncGtkMenus();
                    this._refresh();
                });
        }
        this._connect(global.display, 'notify::focus-window', () => this._refreshFocus());
        this._connect(global.display, 'grab-op-begin', () => FrostEffect.setInteractiveMotion(true));
        this._connect(global.display, 'grab-op-end', (_display, window) => {
            FrostEffect.setInteractiveMotion(false);
            // Geometry notifications already update layout. Refresh only the
            // released window's snapshot, rather than every desktop surface.
            for (const state of this._windows.values()) {
                if (state.window !== window) continue;
                state.effect?.invalidateBackdrop();
                state.popupEffect?.invalidateBackdrop();
            }
        });
        this._connect(global.window_manager, 'map', (_wm, actor) => this._watch(actor));
        this._connect(Main.overview, 'showing', () => this._refresh());
        this._connect(Main.overview, 'hidden', () => this._refresh());
        this._connect(Main.sessionMode, 'updated', () => this._refresh());
        this._syncMotionTracking();
        this._experience = new Experience(this._settings, this._interface, () => {
            this._syncMotionTracking();
            this._syncGtkMenus();
            this._refresh();
        });
        this._syncMotionTracking();
        this._shellSurfaces = new ShellSurfaces(Main.uiGroup, Main.panel,
            () => this._dark(), () => this._settings.get_boolean('enabled') &&
                !this._reduced() && !Main.sessionMode.isLocked,
            this._redrawGuard, () => this._context());
        this._overviewMaterial = new OverviewMaterial(Main.layoutManager,
            () => this._settings.get_boolean('enabled') && !this._reduced() && !Main.sessionMode.isLocked,
            () => this._context());
        this._lockMaterial = new LockMaterial(Main.screenShield,
            () => this._settings.get_boolean('enabled') && !this._reduced() && Main.sessionMode.isLocked);
        this._button.visible = this._settings.get_boolean('show-panel-indicator') && !Main.sessionMode.isLocked;
        for (const actor of global.get_window_actors())
            this._watch(actor);
        this._syncGtkMenus();
    }

    _connect(object, signal, handler) {
        this._connections.push([object, object.connect(signal, handler)]);
    }

    _watch(actor) {
        if (this._windows.has(actor)) return;
        const window = actor.meta_window;
        if (!window) return;
        const state = {actor, window, layer: null, surface: null, opacity: null,
            refreshEffect: null, signals: []};
        this._windows.set(actor, state);
        for (const signal of ['size-changed', 'position-changed', 'notify::fullscreen', 'notify::minimized'])
            state.signals.push([window, window.connect(signal, () => this._update(actor, state))]);
        state.signals.push([actor, actor.connect('destroy', () => {
            this._clear(state);
            for (const [object, id] of state.signals) object.disconnect(id);
            this._windows.delete(actor);
        })]);
        this._update(actor, state);
    }

    _dark() {
        const appearance = this._settings.get_string('appearance');
        return appearance === 'dark' || (appearance === 'auto' && this._interface.get_string('color-scheme') === 'prefer-dark');
    }

    _context() {
        const state = this._experience?.state ?? {};
        const automatic = this._settings.get_boolean('auto-comfort');
        const battery = {
            windows: this._settings.get_boolean('battery-window-glass'),
            menus: this._settings.get_boolean('battery-menu-glass'),
            dock: this._settings.get_boolean('battery-dock-glass'),
            overview: this._settings.get_boolean('battery-overview-glass'),
        };
        return {...comfortPolicy(state, automatic, this._settings.get_boolean('smooth-performance'), battery),
            ...materialValues(this._settings.get_int('material-strength'))};
    }

    _reduced() {
        return this._settings.get_boolean('reduce-transparency') ||
            (this._settings.get_boolean('auto-comfort') && this._experience?.state.highContrast);
    }

    _syncGtkMenus(disabling = false) {
        try {
            const active = !disabling && this._settings.get_boolean('enabled') && !this._reduced();
            const context = this._context();
            const opacity = !context.menuGlass ? Math.max(94, context.shellOpacity) : context.shellOpacity;
            const css = active ? gtkMenuCss(this._dark(), opacity) : null;
            if (!disabling && this._gtkCss === css) return;
            this._gtkMenus?.apply(css);
            this._gtkCss = css;
        } catch (error) {
            console.error('Polished: GTK menu styling could not be updated', error);
        }
    }

    _refresh(shell = true) {
        this._syncWorkspaceMotion();
        if ((this._workspaceMotion || this._workspaceSettling) &&
            this._settings.get_boolean('enabled') && !this._reduced()) {
            this._workspaceFullRefresh = true;
            return;
        }
        if (this._workspaceFullRefresh) shell = true;
        this._workspaceFullRefresh = false;
        this._workspaceDirtyWindows?.clear();
        if (this._button) {
            this._button.visible = this._settings.get_boolean('show-panel-indicator') && !Main.sessionMode.isLocked;
            if (Main.sessionMode.isLocked) this._button.menu.close();
        }
        this._syncWorkspaceMotion();
        if (shell) this._shellSurfaces?.refresh();
        this._overviewMaterial?.refresh();
        this._lockMaterial?.refresh();
        for (const [actor, state] of this._windows) this._update(actor, state);
    }

    _refreshFocus() {
        this._syncWorkspaceMotion();
        if (this._workspaceMotion || this._workspaceSettling || Main.sessionMode.isLocked) return;
        const focus = global.display.focus_window;
        // Focus changes need only the old/new focus families. Do not refresh
        // the overview, scan Shell actors, or rewrite unrelated window rims.
        for (const [actor, state] of this._windows) {
            const parent = state.window.get_transient_for?.();
            const focused = focus === state.window || Boolean(parent && focus === parent);
            if (state.cachedFocus !== focused) this._update(actor, state);
        }
    }

    _syncMotionTracking() {
        const context = this._context();
        const needed = this._settings.get_boolean('enabled') &&
            (context.windowGlass || context.dockGlass) && !this._reduced();
        if (needed && !this._motionSignal) {
            this._motionSignal = global.stage.connect('before-paint', () => {
                this._syncWorkspaceMotion();
            });
        } else if (!needed && this._motionSignal) {
            global.stage.disconnect(this._motionSignal);
            this._motionSignal = 0;
            this._syncWorkspaceMotion();
        }
    }

    _setWorkspacePaused(paused) {
        FrostEffect.setWorkspaceMotion(paused);
        this._redrawGuard?.setSuspended(paused);
        this._shellSurfaces?.setMotionPaused(paused);
    }

    _syncWorkspaceMotion() {
        // Observe GNOME's controller without wrapping its animation methods.
        const active = Boolean(this._motionSignal && Main.wm?._workspaceAnimation?._switchData);
        if (Boolean(this._workspaceMotion) === active) {
            if (!this._motionSignal && this._workspaceSettling) {
                this._workspaceResume?.cancel();
                this._workspaceSettling = false;
                this._setWorkspacePaused(false);
            }
            return false;
        }
        this._workspaceMotion = active;
        if (active) {
            this._workspaceResume?.cancel();
            this._workspaceSettling = false;
            this._setWorkspacePaused(true);
        } else if (this._motionSignal) {
            this._workspaceSettling = true;
            this._workspaceResume.schedule();
        } else {
            this._workspaceResume?.cancel();
            this._workspaceSettling = false;
            this._setWorkspacePaused(false);
        }
        return true;
    }

    _finishWorkspaceMotion() {
        if (!this._settings) return;
        this._syncWorkspaceMotion();
        if (this._workspaceMotion) return;
        this._workspaceSettling = false;
        this._setWorkspacePaused(false);
        const dirty = [...this._workspaceDirtyWindows];
        this._workspaceDirtyWindows.clear();
        if (this._workspaceFullRefresh) {
            this._workspaceFullRefresh = false;
            this._refresh();
        } else {
            // A normal switch changes focus, not every material on the desktop.
            for (const actor of dirty) {
                const state = this._windows.get(actor);
                if (state) this._update(actor, state);
            }
            this._refreshFocus();
        }
    }

    _update(actor, state) {
        state.actor ??= actor;
        // Focus/geometry notifications during a slide must not tear down and
        // rebuild materials on the source windows used by animation clones.
        if ((this._workspaceMotion || this._workspaceSettling) && this._settings.get_boolean('enabled') && !this._reduced()) {
            this._workspaceDirtyWindows.add(actor);
            return;
        }
        const s = this._settings;
        const w = state.window;
        const type = w.get_window_type();
        const isPopup = [Meta.WindowType.MENU, Meta.WindowType.DROPDOWN_MENU, Meta.WindowType.POPUP_MENU,
            Meta.WindowType.TOOLTIP, Meta.WindowType.COMBO].includes(type);
        const isDialog = [Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG,
            Meta.WindowType.UTILITY, Meta.WindowType.TOOLBAR].includes(type);
        const parent = w.get_transient_for?.();
        const context = this._context();
        const focused = global.display.focus_window === w ||
            Boolean(parent && global.display.focus_window === parent);
        const active = s.get_boolean('enabled') && !this._reduced() &&
            (!Main.overview.visible || !context.windowGlass) && !Main.sessionMode.isLocked && eligible({
                normal: type === Meta.WindowType.NORMAL || isPopup || isDialog,
                fullscreen: w.is_fullscreen(), minimized: w.minimized,
            });
        if (!active) { this._clear(state); state.cachedFocus = focused; return; }
        if (!(isPopup ? context.menuGlass : context.windowGlass)) {
            // Keep native client opacity and Mutter's normal culling path.
            // A simple non-picking rim supplies focus without backdrop effects.
            this._clear(state, !isPopup);
            if (!isPopup) this._updateRim(actor, state, focused);
            state.cachedFocus = focused;
            return;
        }
        if (!state.surface) {
            state.surface = clientSurfaceRoot(actor.get_children(), child =>
                GObject.type_name_from_instance(child));
            if (!state.surface) return;
            state.opacity = state.surface.opacity;
        }
        const mode = 'frost';
        if (state.layer && state.effectMode !== mode) { state.layer.destroy(); state.layer = null; state.effect = null; }
        if (isPopup) {
            // Popup frost is attached to the client surface below; never put
            // a second frame-sized plate behind native arrows and margins.
            state.layer?.destroy();
            state.layer = null;
            state.effect = null;
            state.rim?.destroy();
            state.rim = null;
            state.rimStyle = null;
            state.rimBounds = null;
        } else {
            if (!state.layer) {
                state.layer = new VisualBackdrop({reactive: false, can_focus: false, track_hover: false, clip_to_allocation: true});
                state.effect = new FrostEffect();
                state.effectMode = mode;
                state.layerStyle = null;
                state.paintKey = null;
                if (state.effect) state.layer.add_effect(state.effect);
                actor.insert_child_at_index(state.layer, 0);
            }
            const frame = w.get_frame_rect();
            const buffer = w.get_buffer_rect();
            state.layer.set_position(frame.x - buffer.x, frame.y - buffer.y);
            state.layer.set_size(frame.width, frame.height);
            const dark = this._dark();
            const radius = 12;
            this._updateRim(actor, state, focused);
            if (state.effect) {
                state.effect.radii = [radius, radius, radius, radius];
            }
            const style = materialStyle(dark, {focused, emphasis: !isDialog}) + ` border-radius: ${radius}px;`;
            if (state.layerStyle !== style) { state.layer.set_style(style); state.layerStyle = style; }
            if (state.effect) {
                state.effect.radius = 36;
                state.effect.brightness = dark ? 0.85 : 1.0;
                state.effect.veil = [...(dark ? [0.10, 0.11, 0.14] : [0.94, 0.95, 0.97]),
                    context.detail / 100];
            }
            const paintKey = JSON.stringify([style, state.effect?.radius,
                state.effect?.brightness, state.effect?.radii, state.effect?.veil]);
            if (state.paintKey !== paintKey) {
                state.paintKey = paintKey;
                state.layer.queue_redraw?.();
            }
        }
        const popupFrost = isPopup;
        if (state.popupEffect && !popupFrost) {
            state.surface.remove_effect(state.popupEffect);
            state.popupEffect = null;
            state.popupPaintKey = null;
        }
        if (popupFrost) {
            if (!state.popupEffect) {
                state.popupEffect = new FrostEffect();
                state.popupEffect.nativeShape = true;
                state.surface.add_effect(state.popupEffect);
            }
            const dark = this._dark();
            state.popupEffect.radius = 36;
            state.popupEffect.clientTintOpacity = context.popupOpacity / 100;
            state.popupEffect.brightness = dark ? 0.85 : 1;
            state.popupEffect.veil = [...(dark ? [0.10, 0.11, 0.14] : [0.94, 0.95, 0.97]),
                context.detail / 100];
            const key = JSON.stringify([state.popupEffect.radius,
                state.popupEffect.brightness, state.popupEffect.veil, state.popupEffect.clientTintOpacity]);
            if (key !== state.popupPaintKey) {
                state.popupPaintKey = key;
                state.surface.queue_redraw?.();
            }
        }
        const hasFrost = Boolean(state.effect || state.popupEffect);
        if (state.cachedFocus !== focused) {
            state.effect?.invalidateBackdrop?.();
            state.popupEffect?.invalidateBackdrop?.();
        }
        state.cachedFocus = focused;
        // Culling protection is needed only while refreshing a snapshot.
        // RedrawGuard releases it after that paint; steady cached glass keeps
        // Mutter's normal culling path rather than forcing all windows through.
        this._redrawGuard?.track(state.layer ?? state.surface, hasFrost,
            state.effect ?? state.popupEffect, capture => {
                if (capture && !state.refreshEffect) {
                    state.refreshEffect = new BackdropRefreshEffect();
                    actor.add_effect(state.refreshEffect);
                } else if (!capture && state.refreshEffect) {
                    actor.remove_effect(state.refreshEffect);
                    state.refreshEffect = null;
                }
            });
        let opacity = isPopup ? context.popupOpacity : context.windowOpacity;
        if (isDialog) opacity = Math.max(99, opacity);
        else if (!isPopup && !focused) opacity = Math.max(98, opacity);
        // Native popup frost composites the translucent fill against the blur.
        // Fading the entire client afterwards leaks sharp background text back
        // through it. In this mode opacity controls the native fill in GLSL.
        state.surface.opacity = popupFrost ? state.opacity : Math.round(state.opacity * opacity / 100);
    }

    _updateRim(actor, state, focused) {
        const frame = state.window.get_frame_rect();
        const buffer = state.window.get_buffer_rect();
        // Opaque CSDs cannot hide this unfiltered, non-picking edge.
        if (!state.rim) {
            state.rim = new VisualBackdrop({reactive: false, can_focus: false,
                track_hover: false, clip_to_allocation: true});
            actor.add_child(state.rim);
        }
        const bounds = [frame.x - buffer.x, frame.y - buffer.y, frame.width, frame.height];
        if (!state.rimBounds || bounds.some((value, index) => value !== state.rimBounds[index])) {
            state.rim.set_position(bounds[0], bounds[1]);
            state.rim.set_size(bounds[2], bounds[3]);
            state.rimBounds = bounds;
        }
        const palette = surfacePalette(this._dark());
        const edge = focused ? palette.activeEdge : palette.inactiveEdge;
        const style = `background-color: transparent; border: 1px solid rgba(${edge}); border-radius: 12px;`;
        if (state.rimStyle !== style) {
            state.rim.set_style(style);
            state.rimStyle = style;
        }
    }

    _clear(state, keepRim = false) {
        if (!keepRim) {
            state.rim?.destroy();
            state.rim = null;
            state.rimStyle = null;
            state.rimBounds = null;
        }
        if (state.layer) this._redrawGuard?.untrack(state.layer);
        if (state.surface) this._redrawGuard?.untrack(state.surface);
        if (state.popupEffect) state.surface?.remove_effect(state.popupEffect);
        state.popupEffect = null;
        state.popupPaintKey = null;
        if (state.surface) state.surface.opacity = state.opacity;
        if (state.refreshEffect) state.actor.remove_effect(state.refreshEffect);
        state.refreshEffect = null;
        state.layer?.destroy();
        state.layer = null;
        state.surface = null;
        state.effect = null;
        state.cachedFocus = null;
    }

    disable() {
        FrostEffect.configureDiagnostics?.(false);
        this._workspaceResume?.cancel();
        this._workspaceResume = null;
        this._workspaceDirtyWindows?.clear();
        if (this._motionSignal) global.stage.disconnect(this._motionSignal);
        this._motionSignal = 0;
        for (const name of this._layoutBindings ?? []) Main.wm.removeKeybinding(name);
        this._layoutBindings = [];
        FrostEffect.setWorkspaceMotion(false);
        FrostEffect.setInteractiveMotion(false);
        this._experience?.destroy();
        this._experience = null;
        this._syncGtkMenus(true);
        this._gtkMenus = null;
        this._overviewMaterial?.destroy();
        this._overviewMaterial = null;
        this._lockMaterial?.destroy();
        this._lockMaterial = null;
        this._shellSurfaces?.destroy();
        this._shellSurfaces = null;
        for (const [object, id] of this._connections) object.disconnect(id);
        for (const state of this._windows.values()) {
            this._clear(state);
            for (const [object, id] of state.signals) object.disconnect(id);
        }
        this._windows.clear();
        this._redrawGuard?.destroy();
        this._redrawGuard = null;
        this._button.destroy();
        this._button = null;
        this._settings = null;
        this._interface = null;
        this._windows = null;
        this._connections = null;
    }
}
