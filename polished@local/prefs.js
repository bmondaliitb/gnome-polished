import {editShortcut} from './shortcutEditor.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {QuietWallpaper} from './quietWallpaper.js';
import {initializeProfile, applyRecommended, applyStrength, applyDesktopProfile, DESKTOP_PROFILES} from './simpleProfile.js';

export default class PolishedPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        initializeProfile(settings);
        window.set_default_size(620, 680);
        const page = new Adw.PreferencesPage({title: 'Polished Desktop', icon_name: 'weather-fog-symbolic'});
        window.add(page);
        const group = new Adw.PreferencesGroup({title: 'Calm, clear and coherent',
            description: 'Readable windows, soft edges and coordinated desktop surfaces. Uses your desktop font, accent and wallpaper.'});
        page.add(group);
        const enabled = new Adw.SwitchRow({title: 'Polished materials'});
        settings.bind('enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(enabled);

        const appearances = ['auto', 'light', 'dark'];
        const appearance = new Adw.ComboRow({title: 'Appearance',
            model: Gtk.StringList.new(['Follow desktop', 'Light', 'Dark'])});
        let syncing = false;
        const syncAppearance = () => {
            syncing = true;
            try { appearance.selected = Math.max(0, appearances.indexOf(settings.get_string('appearance'))); }
            finally { syncing = false; }
        };
        syncAppearance();
        appearance.connect('notify::selected', () => {
            if (!syncing && appearances[appearance.selected])
                settings.set_string('appearance', appearances[appearance.selected]);
        });
        const appearanceId = settings.connect('changed::appearance', syncAppearance);
        window.connect('close-request', () => { settings.disconnect(appearanceId); return false; });
        group.add(appearance);

        const profileNames = [...Object.keys(DESKTOP_PROFILES), 'custom'];
        const profile = new Adw.ComboRow({title: 'Desktop translucency',
            subtitle: 'Coordinates the density of menus and desktop surfaces.',
            model: Gtk.StringList.new([...Object.values(DESKTOP_PROFILES).map(value => value.label), 'Custom…'])});
        group.add(profile);

        const strength = new Adw.SpinRow({title: 'Material strength',
            subtitle: 'Airy is 50. Higher values make surfaces more solid; Low power mode keeps app windows solid.',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 5, page_increment: 10})});
        let updatingStrength = false;
        const syncStrength = () => {
            updatingStrength = true;
            try { strength.value = settings.get_int('material-strength'); }
            finally { updatingStrength = false; }
        };
        syncStrength();
        strength.connect('notify::value', () => {
            if (!updatingStrength) applyStrength(settings, strength.value);
        });
        const strengthId = settings.connect('changed::material-strength', syncStrength);
        window.connect('close-request', () => { settings.disconnect(strengthId); return false; });
        group.add(strength);

        let syncingProfile = false;
        const syncProfile = () => {
            syncingProfile = true;
            try {
                const selected = settings.get_string('desktop-profile');
                profile.selected = Math.max(0, profileNames.indexOf(selected));
                strength.visible = selected === 'custom';
            } finally { syncingProfile = false; }
        };
        syncProfile();
        profile.connect('notify::selected', () => {
            if (!syncingProfile && profileNames[profile.selected])
                applyDesktopProfile(settings, profileNames[profile.selected]);
        });
        const profileId = settings.connect('changed::desktop-profile', syncProfile);
        window.connect('close-request', () => { settings.disconnect(profileId); return false; });

        for (const [title, subtitle, key] of [
            ['Show Polished in the top bar', 'Adds the Polished menu. Preferences remain available through the Extensions app.', 'show-panel-indicator'],
            ['Low power mode', 'Manually turns off desktop blur while keeping the quiet styling. Leave off for glass.', 'smooth-performance'],
            ['Automatic battery saving', 'Uses your battery appearance when unplugged or in system Power Saver. Restores full glass when plugged in.', 'auto-comfort'],
            ['Reduce transparency', 'Restores native backgrounds and window opacity.', 'reduce-transparency'],
        ]) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        }

        const batteryGroup = new Adw.PreferencesGroup({title: 'Battery appearance',
            description: 'Choose which effects to keep on battery or in Power Saver. Menus keep their glass by default; the larger surfaces become solid. Your normal glass preset stays saved.'});
        page.add(batteryGroup);
        for (const [title, subtitle, key] of [
            ['Glass app windows', 'Adds blur behind full application windows and dialogs.', 'battery-window-glass'],
            ['Glass menus and notifications', 'Keeps the glass effect on smaller floating surfaces.', 'battery-menu-glass'],
            ['Glass dock', 'Blurs the background behind the dock.', 'battery-dock-glass'],
            ['Overview background blur', 'Adds a blurred wallpaper layer to the overview.', 'battery-overview-glass'],
        ]) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            batteryGroup.add(row);
        }
        const syncBatteryControls = () => {
            batteryGroup.sensitive = settings.get_boolean('auto-comfort') && !settings.get_boolean('smooth-performance');
        };
        syncBatteryControls();
        const batteryIds = ['auto-comfort', 'smooth-performance'].map(key =>
            settings.connect(`changed::${key}`, syncBatteryControls));
        window.connect('close-request', () => { for (const id of batteryIds) settings.disconnect(id); return false; });

        const paletteGroup = new Adw.PreferencesGroup({title: 'Quiet palette',
            description: 'Soft blue-grey hills in a matching light and dark pair. Follows your desktop appearance.'});
        page.add(paletteGroup);
        const wallpaper = new QuietWallpaper(new Gio.Settings({schema_id: 'org.gnome.desktop.background'}),
            settings, this.dir.get_child('wallpapers'));
        const wallpaperRow = new Adw.ActionRow({title: 'Coordinated wallpaper',
            subtitle: 'Your current wallpaper stays until you choose Use wallpaper.'});
        const applyWallpaper = new Gtk.Button({label: 'Use wallpaper', valign: Gtk.Align.CENTER});
        const restoreWallpaper = new Gtk.Button({label: 'Restore previous', valign: Gtk.Align.CENTER,
            sensitive: wallpaper.canRestore});
        applyWallpaper.connect('clicked', () => {
            wallpaper.apply();
            window.add_toast(new Adw.Toast({title: 'Quiet wallpaper applied'}));
        });
        restoreWallpaper.connect('clicked', () => {
            wallpaper.restore();
            window.add_toast(new Adw.Toast({title: 'Previous wallpaper restored'}));
        });
        const wallpaperId = settings.connect('changed::wallpaper-backup', () => {
            restoreWallpaper.sensitive = wallpaper.canRestore;
        });
        window.connect('close-request', () => { settings.disconnect(wallpaperId); return false; });
        wallpaperRow.add_suffix(restoreWallpaper);
        wallpaperRow.add_suffix(applyWallpaper);
        paletteGroup.add(wallpaperRow);

        const layoutGroup = new Adw.PreferencesGroup({title: 'Comfortable window layouts',
            description: 'Arrange the focused app when you need it. New windows keep their application’s preferred size and placement.'});
        page.add(layoutGroup);
        for (const [title, subtitle, key] of [
            ['Center window', 'Moves the focused window without resizing it.', 'polished-center-window'],
            ['Comfortable size', 'Centers the focused window with breathing room around it.', 'polished-comfortable-window'],
        ]) {
            const row = new Adw.ActionRow({title, subtitle});
            const shortcut = new Gtk.ShortcutLabel({accelerator: settings.get_strv(key)[0] ?? '',
                disabled_text: 'Not assigned', valign: Gtk.Align.CENTER});
            const shortcutId = settings.connect(`changed::${key}`, () => {
                shortcut.accelerator = settings.get_strv(key)[0] ?? '';
            });
            window.connect('close-request', () => { settings.disconnect(shortcutId); return false; });
            const edit = new Gtk.Button({label: 'Edit…', valign: Gtk.Align.CENTER});
            edit.connect('clicked', () => editShortcut(window, settings, key, title));
            row.add_suffix(shortcut);
            row.add_suffix(edit);
            layoutGroup.add(row);
        }

        const diagnostics = new Adw.PreferencesGroup({title: 'Performance diagnostics',
            description: 'Optional capture counts, CPU submission timings and retained snapshot estimates in the GNOME Shell journal. Reports every 120 captures and when switched off. No polling timer; does not measure GPU time or frame rate.'});
        const diagnosticSwitch = new Adw.SwitchRow({title: 'Record glass diagnostics'});
        settings.bind('capture-diagnostics', diagnosticSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        diagnostics.add(diagnosticSwitch);
        page.add(diagnostics);

        const help = new Adw.PreferencesGroup({title: 'One consistent material'});
        page.add(help);
        help.add(new Adw.ActionRow({title: 'Your desktop palette',
            subtitle: 'Keeps your desktop font and accent. Choose the quiet wallpaper above or keep your own; other desktop preferences stay yours.'}));
        help.add(new Adw.ActionRow({title: 'Comfort under load',
            subtitle: 'Glass is the normal look. Battery appearance reduces selected effects automatically; Low power mode turns desktop blur off manually for demanding work.'}));
        help.add(new Adw.ActionRow({title: 'Application menus',
            subtitle: 'Restart GTK4 apps to load matching menus. Native app layouts remain under each application’s control.'}));
        const reset = new Adw.ActionRow({title: 'Restore recommended look'});
        const button = new Gtk.Button({label: 'Restore', valign: Gtk.Align.CENTER});
        button.connect('clicked', () => {
            settings.set_string('appearance', 'auto');
            applyRecommended(settings);
        });
        reset.add_suffix(button);
        help.add(reset);
    }
}
