import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {initializeProfile, applyRecommended, applyStrength, applyDesktopProfile, DESKTOP_PROFILES} from './simpleProfile.js';

export default class PolishedPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        initializeProfile(settings);
        window.set_default_size(620, 680);
        const page = new Adw.PreferencesPage({title: 'Polished Desktop', icon_name: 'weather-fog-symbolic'});
        window.add(page);
        const group = new Adw.PreferencesGroup({title: 'Calm, clear and coherent',
            description: 'Readable windows, soft edges and coordinated desktop surfaces. Uses your desktop font, accent and wallpaper with economical cached blur.'});
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
            subtitle: 'All looks use the same low-cost cached blur.',
            model: Gtk.StringList.new([...Object.values(DESKTOP_PROFILES).map(value => value.label), 'Custom…'])});
        group.add(profile);

        const strength = new Adw.SpinRow({title: 'Material strength',
            subtitle: 'Airy is 50. Higher values improve foreground clarity; lower values reveal more background.',
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
            ['Automatic power saving', 'Keeps translucency on battery and limits live effects in Power Saver. Also respects system high contrast.', 'auto-comfort'],
            ['Reduce transparency', 'Restores native backgrounds and window opacity.', 'reduce-transparency'],
        ]) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        }

        const help = new Adw.PreferencesGroup({title: 'One consistent material'});
        page.add(help);
        help.add(new Adw.ActionRow({title: 'Your desktop palette',
            subtitle: 'Uses your current wallpaper, font and accent. Change these in system settings. Global fonts, wallpaper and animation preferences stay yours.'}));
        help.add(new Adw.ActionRow({title: 'Soft, cached backgrounds',
            subtitle: 'Backgrounds refresh on focus and after moving or resizing windows. Use Refresh cached backgrounds in the Polished panel menu for a fresh snapshot.'}));
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
