# Login name-box styling

`stylesheet.css` is the complete CSS update for the already-installed
`polished-minimum-login@local` GDM companion. It coordinates account-name rows,
the vertical identity label and username/password entry states. The existing
opaque panel, wallpaper and high-contrast opt-out remain in place. No desktop
capture, authentication code or GDM settings are changed.

Apply after the native parser check (`make check-runtime-api`):

```sh
sudo install -m 644 integration/login/stylesheet.css /usr/share/gnome-shell/extensions/polished-minimum-login@local/stylesheet.css
```

It loads when the greeter starts again. Do not restart GDM during an active
session. A reboot will load it without requiring a service restart command.
`stylesheet.previous.css` preserves the CSS that was installed before this update;
install that file to the same destination to undo. The companion's original
installer lives in the neighboring `gnome-polished-minimum` project; reinstalling
that project's older bundle will also replace this update.
