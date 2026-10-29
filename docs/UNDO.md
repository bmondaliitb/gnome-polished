# Completely undo Polished, Prism and Polished Minimum

Disabling a desktop extension removes its live Shell effects. It does **not** uninstall a separately installed GDM login-screen companion, undo an explicitly applied wallpaper/dock profile, or remove another project's GTK stylesheet. Already-running GTK applications may also retain their loaded stylesheet until they exit.

This guide covers the customizations found on this Ubuntu/GNOME installation. It restores the distribution's defaults, which may be Ubuntu's Yaru theme and Ubuntu wallpaper rather than upstream GNOME's Adwaita appearance. No package installation, full-home deletion, global dconf reset or login-manager restart is needed.

## Single-script rollback

From the `gnome-polished` checkout, preview the exact settings that will be reset:

```sh
/usr/bin/python3 tools/undo-all.py
```

Then perform the entire rollback with one command:

```sh
/usr/bin/python3 tools/undo-all.py --apply
```

Run it **as your normal desktop user, without putting `sudo` before this command**. It requests your administrator password through `sudo` only when installed login-screen companions need removal. It has no dependency on the neighboring source checkouts and can also be copied elsewhere and run with `/usr/bin/python3`.

The script backs up dconf, GTK files and the selected appearance settings; disables and archives the three project desktop extensions; removes Polished/Prism menu rules; resets the appearance, wallpaper, button and dock keys listed below; clears only the three project preference namespaces; and archives the saved Minimum profile. Other extensions, application profiles, display resolution and fractional scaling remain outside its reset list. Defaults are the installed distribution defaults, not a reconstruction of personal preferences from before customization.

User recovery copies are stored in `$XDG_STATE_HOME/gnome-material-undo/<timestamp>` (normally `~/.local/state/gnome-material-undo/<timestamp>`). The privileged phase archives the two owned login installations and their original compiled database under `/var/lib/gnome-material-undo/<timestamp>`. It validates ownership and compiles/checks the future greeter configuration before moving original files. If the final database replacement fails, moved system files are restored. If a later desktop step fails, earlier completed steps remain applied; the error and backup locations are reported.

The default invocation is **preview only**. `--apply --user-only` intentionally skips login-screen cleanup and requires no administrator access; it is a partial rollback when login companions are installed. Missing project installations are skipped, so the script can be rerun. Edited login ownership records, linked target paths, malformed GTK markers and unrecognized generated stylesheets are refused rather than removed.

After a successful full run, save your work and **reboot**. The script never restarts GDM, kills applications, logs you out or reboots automatically. Verify using the checks in section 6 below. The manual steps that follow are an alternative to the script; you do not need to run them again after a successful scripted rollback.

## Manual alternative

Run these commands yourself in a normal desktop terminal. Documentation changes do not perform this rollback. Start in the `gnome-polished` checkout; the `gnome-material` and `gnome-polished-minimum` checkouts are expected beside it.

## 1. Save a recovery copy

```sh
undo_backup="$HOME/.local/state/gnome-style-undo-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$undo_backup"
dconf dump / > "$undo_backup/dconf.ini"
for toolkit in gtk-3.0 gtk-4.0; do
    if [ -d "$HOME/.config/$toolkit" ]; then
        cp -a "$HOME/.config/$toolkit" "$undo_backup/$toolkit"
    fi
done
printf 'Backup: %s\n' "$undo_backup"
```

The dconf copy is a recovery record, not something to load wholesale afterward: doing so would also restore the customizations you are removing. Keep it private because it contains preferences from other applications.

## 2. Disable the related desktop extensions

```sh
for extension in polished@local prism@local polished-minimum@local; do
    if gnome-extensions list | grep -Fxq "$extension"; then
        gnome-extensions disable "$extension"
    fi
done
```

Leave unrelated extensions alone. If you already uninstalled these extensions, skip this step. Uninstalling them is optional once they are disabled:

```sh
for extension in polished@local prism@local polished-minimum@local; do
    if gnome-extensions list --user | grep -Fxq "$extension"; then
        gnome-extensions uninstall "$extension"
    fi
done
```

Uninstalling the desktop packages does not uninstall the system login-screen companions described below.

## 3. Remove the leftover GTK menu rules

A remaining `BEGIN PRISM GTK MENUS` block was found in `~/.config/gtk-4.0/gtk.css` even after Polished was disabled. These rules affect Files, Terminal and other GTK applications independently of the running Shell extension.

The following cleanup removes **only** the Polished/Prism managed menu blocks, preserves other CSS, and moves recognized generated stylesheets into a separate backup. It does not delete either GTK configuration directory. Run it as your normal user, without `sudo`:

```python
# Save this block as /tmp/undo-material-menus.py, then run:
# /usr/bin/python3 /tmp/undo-material-menus.py
from datetime import datetime
from pathlib import Path
import os
import re
import shutil

config = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config')))
state = Path(os.environ.get('XDG_STATE_HOME', str(Path.home() / '.local/state')))
backup = state / ('material-menu-undo-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
backup.mkdir(parents=True, exist_ok=False)

for toolkit in ('gtk-3.0', 'gtk-4.0'):
    directory = config / toolkit
    saved = backup / toolkit
    main = directory / 'gtk.css'
    if main.is_symlink():
        raise RuntimeError(f'Refusing to replace a symlink: {main}; inspect its target manually.')
    if main.exists():
        original = main.read_text()
        cleaned = original
        for name in ('POLISHED', 'PRISM'):
            begin = f'/* BEGIN {name} GTK MENUS */'
            end = f'/* END {name} GTK MENUS */'
            if cleaned.count(begin) != cleaned.count(end):
                raise RuntimeError(f'Incomplete {name} menu block in {main}; inspect before editing.')
            cleaned = re.sub(re.escape(begin) + r'[\s\S]*?' + re.escape(end) + r'\n?', '', cleaned)
        if cleaned != original:
            saved.mkdir(exist_ok=True)
            shutil.copy2(main, saved / 'gtk.css')
            main.write_text(cleaned)
            print(f'Removed managed menu rules: {main}')
    for filename, owner in (
        ('polished-managed-menus.css', '/* Generated by Polished Materials. */'),
        ('prism-managed-menus.css', '/* Generated by Prism Materials. */'),
    ):
        generated = directory / filename
        if generated.is_symlink():
            raise RuntimeError(f'Refusing a symlink: {generated}')
        if generated.exists():
            if not generated.read_text().startswith(owner):
                raise RuntimeError(f'Unrecognized file left untouched: {generated}')
            saved.mkdir(exist_ok=True)
            shutil.move(str(generated), str(saved / filename))
            print(f'Moved generated stylesheet to backup: {generated}')
print(f'GTK recovery copies: {backup}')
```

If the terminal reports an incomplete block or unrecognized file, keep the backups and inspect that specific file; do not delete the entire configuration directory. Other explicit imports of these generated files, if added manually outside the managed blocks, must also be removed manually.

Fully exit and reopen Files, Terminal and other affected GTK applications after cleanup. A new window in an existing application process may still use the old stylesheet. Logging out at the end also closes those processes.

## 4. Undo the saved desktop profile, or reset appearance defaults

If you applied Polished Minimum's dock/window-button/wallpaper profile and still have its backup, restore it first:

```sh
/usr/bin/python3 ../gnome-polished-minimum/tools/profile.py restore
```

Its backup normally lives at `~/.local/state/polished-minimum/profile.json`. The helper preserves later edits and reports if no backup exists. It does not change the login screen.

For **distribution defaults**, rather than the exact preferences you had before customization, run the following. It resets only the listed appearance, wallpaper, window-button and dock keys; it does not reset terminal profiles, browser settings, display resolution, fractional scaling, keyboard layouts or unrelated extensions. It also replaces any personal choices you made for the listed keys.

```python
# Save as /tmp/reset-material-appearance.py, then run as your normal user:
# /usr/bin/python3 /tmp/reset-material-appearance.py
from gi.repository import Gio

keys = {
    'org.gnome.desktop.interface': [
        'gtk-theme', 'icon-theme', 'cursor-theme', 'color-scheme', 'accent-color',
        'font-name', 'document-font-name', 'monospace-font-name',
        'text-scaling-factor', 'enable-animations', 'enable-hot-corners',
    ],
    'org.gnome.desktop.wm.preferences': ['button-layout', 'theme'],
    'org.gnome.desktop.background': ['picture-uri', 'picture-uri-dark', 'picture-options'],
    'org.gnome.shell.extensions.dash-to-dock': [
        'dock-position', 'extend-height', 'dock-fixed', 'autohide', 'intellihide',
        'manualhide', 'dash-max-icon-size', 'icon-size-fixed', 'transparency-mode',
        'background-opacity', 'custom-background-color', 'background-color',
        'running-indicator-style',
    ],
}
source = Gio.SettingsSchemaSource.get_default()
for schema_id, names in keys.items():
    schema = source.lookup(schema_id, True)
    if schema is None:
        print(f'Skipping unavailable schema: {schema_id}')
        continue
    settings = Gio.Settings.new_full(schema, None, None)
    for key in names:
        if not schema.has_key(key):
            continue
        if not settings.is_writable(key):
            print(f'Skipping locked setting: {schema_id} {key}')
            continue
        settings.reset(key)
        print(f'Default: {schema_id} {key} = {settings.get_default_value(key).print_(True)}')
Gio.Settings.sync()
```

On this machine, Ubuntu Sans, Yaru and the Ubuntu wallpaper can be valid defaults. Their presence alone does not indicate that an extension is still modifying the desktop. The reset deliberately uses the installed schema defaults instead of hardcoding another distribution's theme names.

If you prefer your original wallpaper to the distribution wallpaper and still have Polished installed, its preferences offer **Quiet palette → Restore previous**. That action needs the extension's saved `wallpaper-backup` setting. A prior dconf reset may have erased that backup; in that case choose your old image manually or use the defaults above.

## 5. Remove both system login-screen companions

Two independent login-screen customizations were found:

| Companion | System defaults file | Installation state |
| --- | --- | --- |
| Polished Minimum | `/usr/share/gdm/dconf/zz-polished-minimum` | `/var/lib/polished-minimum-login` |
| Prism | `/usr/share/gdm/dconf/99-prism-materials` | `/var/lib/prism-login-material` |

A reset of your own GNOME/dconf settings does not affect GDM's separate system configuration. Removing Minimum alone exposes the older Prism defaults, so **remove both, in this order**. From the `gnome-polished` checkout, run each command in your terminal and enter your administrator password when asked:

```sh
sudo /usr/bin/python3 ../gnome-polished-minimum/tools/login-material.py --remove
sudo /usr/bin/python3 ../gnome-material/tools/login-material.py --remove
```

Run a command only if that companion is installed. Stop if a helper reports an ownership, edited-file or compilation error; do not bypass its checks with a broad `rm`. Each helper validates its saved ownership record, removes its own drop-in, recompiles and validates Ubuntu's greeter defaults, and removes its own extension/wallpaper files. A compilation failure restores its drop-in. Neither command restarts GDM or interrupts the current desktop session.

Do not remove `00-upstream-settings`, `90-debian-settings`, the whole GDM dconf directory, or the packaged GNOME Shell theme. These projects used separate companions; removing their owned files is the rollback. Keep the source checkouts until the helpers finish successfully.

## 6. Reboot and verify

Save your work and reboot after both login-screen removals succeed. Rebooting loads the rebuilt greeter configuration, clears runtime effects from the old session, and starts applications without their cached custom GTK rules. Do not run `systemctl restart gdm` during an active session.

After signing in:

```sh
gnome-extensions list --enabled
ls /usr/share/gdm/dconf
```

The enabled-extension list should contain no `polished@local`, `prism@local` or `polished-minimum@local`. The GDM directory should contain neither `zz-polished-minimum` nor `99-prism-materials`. Other normal distribution entries/extensions should remain.

To check for leftover GTK menu blocks:

```sh
grep -nE 'BEGIN (POLISHED|PRISM) GTK MENUS' "$HOME/.config/gtk-4.0/gtk.css"
```

No matching output is expected; a missing `gtk.css` is also normal. If an app still has a custom appearance after this, inspect its own theme/profile preferences or unrelated user CSS instead of resetting all application settings. The backup directories and source checkouts are inactive files and can be retained without affecting the desktop.
