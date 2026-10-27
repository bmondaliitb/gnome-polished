// Applying a wallpaper is a deliberate preference action. Never change it on
// extension enable, appearance changes or Restore recommended look.
const KEYS = ['picture-uri', 'picture-uri-dark', 'picture-options'];
export class QuietWallpaper {
    constructor(background, settings, directory) {
        this._background = background;
        this._settings = settings;
        this._values = {
            'picture-uri': directory.get_child('quiet-dawn.svg').get_uri(),
            'picture-uri-dark': directory.get_child('quiet-dusk.svg').get_uri(),
            'picture-options': 'zoom',
        };
    }

    _saved() {
        try {
            const saved = JSON.parse(this._settings.get_string('wallpaper-backup'));
            if (KEYS.every(key => typeof saved?.previous?.[key] === 'string' &&
                typeof saved?.applied?.[key] === 'string')) return saved;
        } catch { /* An absent or invalid backup cannot be restored. */ }
        return null;
    }

    get canRestore() { return this._saved() !== null; }

    apply() {
        const saved = this._saved();
        // Preserve the first backup on repeated clicks. If the user selected
        // another wallpaper in Settings, start from that new preference instead.
        const stillApplied = saved && KEYS.every(key =>
            this._background.get_string(key) === saved.applied[key]);
        const previous = stillApplied ? saved.previous
            : Object.fromEntries(KEYS.map(key => [key, this._background.get_string(key)]));
        this._settings.set_string('wallpaper-backup', JSON.stringify({previous, applied: this._values}));
        for (const key of KEYS) this._background.set_string(key, this._values[key]);
    }

    restore() {
        const saved = this._saved();
        if (!saved) return;
        for (const key of KEYS) {
            // Preserve changes made in Settings since the wallpaper was applied.
            if (this._background.get_string(key) === saved.applied[key])
                this._background.set_string(key, saved.previous[key]);
        }
        this._settings.set_string('wallpaper-backup', '');
    }
}
