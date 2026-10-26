import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function memorySettings() {
    const directory = GLib.dir_make_tmp('polished-settings-XXXXXX');
    const [, bytes] = GLib.file_get_contents('polished@local/schemas/org.gnome.shell.extensions.polished.gschema.xml');
    GLib.file_set_contents(directory + '/org.gnome.shell.extensions.polished.gschema.xml', bytes);
    const [ok, , stderr, status] = GLib.spawn_sync(null, ['glib-compile-schemas', '--strict', directory], null,
        GLib.SpawnFlags.SEARCH_PATH, null);
    if (!ok || status !== 0) throw new Error(new TextDecoder().decode(stderr));
    const source = Gio.SettingsSchemaSource.new_from_directory(directory, Gio.SettingsSchemaSource.get_default(), false);
    const schema = source.lookup('org.gnome.shell.extensions.polished', false);
    const settings = Gio.Settings.new_full(schema, Gio.memory_settings_backend_new(), null);
    for (const name of ['org.gnome.shell.extensions.polished.gschema.xml', 'gschemas.compiled']) GLib.unlink(directory + '/' + name);
    GLib.rmdir(directory);
    return settings;
}
