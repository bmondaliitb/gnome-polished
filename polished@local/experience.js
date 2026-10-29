import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';

// Small, pure policies are shared by Shell, app backdrops, and tests.
export function comfortPolicy(state, automatic, manual = false, battery = {}) {
    const batterySaving = Boolean(automatic && (state.onBattery || state.powerSaver));
    const keep = {windows: false, menus: true, dock: false, overview: false, ...battery};
    const enabled = kind => !manual && (!batterySaving || Boolean(keep[kind]));
    return {...state, powerSaver: Boolean(automatic && state.powerSaver),
        batterySaving, smoothPerformance: Boolean(manual),
        windowGlass: enabled('windows'), menuGlass: enabled('menus'),
        dockGlass: enabled('dock'), overviewGlass: enabled('overview')};
}

export function surfaceOpacity(kind, alpha, glass = false) {
    const offset = {dialogs: 0.08, notifications: 0.05, dock: -0.1}[kind] ?? 0;
    // Fade the tint, not the text. Denser presets keep their clarity advantage.
    const relief = glass ? ({menus: 0.08, switchers: 0.08, notifications: 0.08, dock: 0.06, dialogs: 0.04}[kind] ?? 0) *
        Math.max(0, Math.min(1, (1 - alpha) / 0.24)) : 0;
    return Math.round(Math.max(glass ? 0.56 : 0.4, Math.min(1, alpha + offset - relief)) * 1000) / 1000;
}

export function panelIsDark(dark, alpha, luminance) {
    if (!Number.isFinite(luminance)) return dark;
    // Estimate the composite, not just the wallpaper, so an opaque panel keeps
    // a readable foreground. The result is an approximation for the top band.
    const tint = dark ? 0.13 : 0.87;
    return luminance * (1 - alpha) + tint * alpha < 0.5;
}

export function solidLuminance(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return null;
    const channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function wallpaperLuminance(pixbuf) {
    const pixels = pixbuf.get_pixels();
    const channels = pixbuf.get_n_channels(), stride = pixbuf.get_rowstride();
    const height = Math.max(1, Math.ceil(pixbuf.get_height() / 5));
    let total = 0, count = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < pixbuf.get_width(); x++) {
            const i = y * stride + x * channels;
            total += (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
            count++;
        }
    }
    return count ? total / count : null;
}

export class Experience {
    constructor(settings, interfaceSettings, changed) {
        this.state = {highContrast: false, powerSaver: false, onBattery: false, luminance: null};
        this._settings = settings;
        this._interface = interfaceSettings;
        this._changed = changed;
        this._signals = [];
        this._cancel = new Gio.Cancellable();
        this._wallpaperCancel = null;
        this._background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        this._a11y = new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.interface'});
        this._listen(this._a11y, 'changed::high-contrast', () => this._sync());
        this._listen(this._interface, 'changed::color-scheme', () => this._wallpaper());
        this._listen(settings, 'changed::appearance', () => this._wallpaper());
        this._listen(this._background, 'changed', () => this._wallpaper());
        this._proxy('org.freedesktop.UPower', '/org/freedesktop/UPower',
            'org.freedesktop.UPower', proxy => { this._upower = proxy; });
        this._proxy('org.freedesktop.UPower.PowerProfiles', '/org/freedesktop/UPower/PowerProfiles',
            'org.freedesktop.UPower.PowerProfiles', proxy => { this._power = proxy; });
        this._sync();
        this._wallpaper();
    }

    _listen(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _proxy(name, path, iface, save) {
        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null, name, path, iface, this._cancel, (_source, result) => {
                try {
                    const proxy = Gio.DBusProxy.new_for_bus_finish(result);
                    if (!this._changed) return;
                    save(proxy);
                    this._listen(proxy, 'g-properties-changed', () => this._sync());
                    this._sync();
                } catch { /* Optional services may be unavailable. */ }
            });
    }

    _sync() {
        this.state.onBattery = this._upower?.get_cached_property('OnBattery')?.deep_unpack() === true;
        this.state.highContrast = this._a11y.get_boolean('high-contrast');
        this.state.powerSaver = this._power?.get_cached_property('ActiveProfile')?.deep_unpack() === 'power-saver';
        this._changed?.();
    }

    _wallpaper() {
        this._wallpaperCancel?.cancel();
        const cancel = new Gio.Cancellable();
        this._wallpaperCancel = cancel;
        this.state.luminance = null;
        this._changed?.();
        if (this._background.get_string('picture-options') === 'none') {
            this.state.luminance = solidLuminance(this._background.get_string('primary-color'));
            this._changed?.();
            return;
        }
        const appearance = this._settings.get_string('appearance');
        const dark = appearance === 'dark' || (appearance === 'auto' &&
            this._interface.get_string('color-scheme') === 'prefer-dark');
        const uri = this._background.get_string(dark ? 'picture-uri-dark' : 'picture-uri');
        if (!uri.startsWith('file:')) return;
        // One async decode to <=64x64 on wallpaper changes. No screen readback,
        // no polling, no per-frame image sampling. Unsupported formats fall back.
        Gio.File.new_for_uri(uri).read_async(0, cancel, (file, result) => {
            let stream;
            try { stream = file.read_finish(result); } catch { return; }
            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, 64, 64, true, cancel, (_source, decoded) => {
                try {
                    const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(decoded);
                    if (!cancel.is_cancelled() && this._changed) {
                        this.state.luminance = wallpaperLuminance(pixbuf);
                        this._changed();
                    }
                } catch { /* Keep appearance-based foreground on decode failure. */ }
                finally { stream.close_async(0, null, (s, r) => { try { s.close_finish(r); } catch {} }); }
            });
        });
    }

    destroy() {
        this._changed = null;
        this._cancel.cancel();
        this._wallpaperCancel?.cancel();
        for (const [object, id] of this._signals) object.disconnect(id);
        this._signals = [];
        this._power = null;
        this._upower = null;
    }
}
