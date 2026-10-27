import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

export function shortcutConflict(accelerator, ownKey, settings, systemSettings = []) {
    const normalized = value => {
        const [valid, key, modifiers] = Gtk.accelerator_parse(value);
        return valid ? Gtk.accelerator_name(key, modifiers) : '';
    };
    const wanted = normalized(accelerator);
    if (!wanted) return false;
    for (const key of ['polished-center-window', 'polished-comfortable-window'])
        if (key !== ownKey && settings.get_strv(key).some(value => normalized(value) === wanted)) return true;
    for (const system of systemSettings) {
        for (const key of system.settings_schema.list_keys()) {
            const value = system.get_value(key).deep_unpack();
            const accelerators = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
            if (accelerators.some(item => typeof item === 'string' && normalized(item) === wanted)) return true;
        }
    }
    return false;
}

export function editShortcut(parent, settings, key, title) {
    const dialog = new Gtk.Window({title, transient_for: parent, modal: true,
        default_width: 440, resizable: false});
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 18,
        margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24});
    dialog.set_child(box);
    const instruction = new Gtk.Label({label: 'Press a shortcut using Ctrl, Alt or Super.', wrap: true});
    const preview = new Gtk.ShortcutLabel({accelerator: settings.get_strv(key)[0] ?? '', disabled_text: 'Not assigned'});
    const status = new Gtk.Label({label: 'Escape cancels. Backspace clears the assignment.', wrap: true});
    box.append(instruction); box.append(preview); box.append(status);
    const buttons = new Gtk.Box({spacing: 8, halign: Gtk.Align.END});
    const cancel = new Gtk.Button({label: 'Cancel'});
    const clear = new Gtk.Button({label: 'Disable'});
    const reset = new Gtk.Button({label: 'Use default'});
    const apply = new Gtk.Button({label: 'Apply', sensitive: false});
    apply.add_css_class('suggested-action');
    for (const button of [cancel, clear, reset, apply]) buttons.append(button);
    box.append(buttons);
    const schemaSource = Gio.SettingsSchemaSource.get_default();
    const systems = ['org.gnome.desktop.wm.keybindings', 'org.gnome.mutter.keybindings',
        'org.gnome.mutter.wayland.keybindings', 'org.gnome.settings-daemon.plugins.media-keys']
        .filter(id => schemaSource.lookup(id, true)).map(schema_id => new Gio.Settings({schema_id}));
    let candidate = '';
    const choose = accelerator => {
        candidate = accelerator;
        preview.accelerator = accelerator;
        const conflict = accelerator && shortcutConflict(accelerator, key, settings, systems);
        status.label = conflict ? 'This shortcut is already assigned. Choose another.' :
            accelerator ? 'Apply to save this shortcut.' : 'Apply to disable this shortcut.';
        apply.sensitive = !conflict;
    };
    cancel.connect('clicked', () => dialog.close());
    clear.connect('clicked', () => choose(''));
    reset.connect('clicked', () => choose(settings.get_default_value(key).deep_unpack()[0] ?? ''));
    apply.connect('clicked', () => {
        // Recheck in case another settings window changed an assignment.
        if (candidate && shortcutConflict(candidate, key, settings, systems)) { choose(candidate); return; }
        settings.set_strv(key, candidate ? [candidate] : []);
        dialog.close();
        parent.add_toast(new Adw.Toast({title: 'Window shortcut updated'}));
    });
    const keys = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
    keys.connect('key-pressed', (_controller, keyval, _keycode, state) => {
        if (keyval === Gdk.KEY_Escape) { dialog.close(); return true; }
        if (keyval === Gdk.KEY_BackSpace && !(state & Gtk.accelerator_get_default_mod_mask())) {
            choose(''); return true;
        }
        const modifiers = state & Gtk.accelerator_get_default_mod_mask();
        if (!(modifiers & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK)) ||
            !Gtk.accelerator_valid(keyval, modifiers)) return false;
        choose(Gtk.accelerator_name(Gdk.keyval_to_lower(keyval), modifiers));
        return true;
    });
    dialog.add_controller(keys);
    dialog.present();
}
