# Polished Desktop

A separate GNOME Shell **50** extension, UUID `polished@local`, for a calmer, coherent desktop. It builds on Prism's tested cached material renderer, with an independent schema, GObject types, CSS classes, shader uniforms and GTK stylesheet ownership. Prism's files and preferences are unchanged.

## The look

- **Glass by default:** On normal AC power, the desktop uses the full cached glass treatment. Airy keeps focused app clients at 96% opacity, background windows at least 98%, and dialogs at least 99%; Custom spans 92–100%. Battery appearance independently controls app-window glass, floating menu/notification glass, dock glass and overview blur.
- **Gentle separation:** a subtle active-window rim, much quieter inactive edges, faint surface hairlines, soft menu/card shadows and a rounded dock rim. Shell glass follows native painted coverage, keeping transparent margins and shadow padding clear rather than adding a backing slab around popups. Window shadows remain Mutter's native shadows. Decorative actors never pick or handle input.
- **Coordinated color:** neutral light/dark surfaces, quiet hover states, restrained accent selection in GTK4 menus, and the native theme accent for Shell selection. The wallpaper remains the user's own source of background color. The top bar shares the neutral palette and desktop font; Manual Low power mode gives it a steady, readable backing. An optional pair of quiet landscape wallpapers coordinates with both appearances.
- **Typography and spacing:** material menus and overview follow the desktop font, including size and absolute pixel units. Shell and GTK menu rows share 8×12 px padding and 10 px rounded highlights; overview list rows follow the same rhythm, with coordinated notification spacing. Hover, selection and pressed states follow the same quiet hierarchy across menus, overview and the window switcher. Notification and search titles use a clearer medium-weight hierarchy; timestamps and descriptions stay quieter. Tooltips, notifications, dialogs and menus share a small set of corner radii and soft shadows. App typography and internal layouts remain native.
- **Smooth interaction:** Cached glass never uses a live blur timer and freezes captures during dragging and workspace transitions. Focus changes update only affected window families; inherited hover/style changes do not trigger whole-Shell refreshes. When app-window and dock glass are off, no per-frame workspace-motion observer is installed. Turning off overview blur uses native overview rendering with no additional wallpaper/tint layers. Native animation and keyboard-focus behavior remain intact.

Supported surfaces include normal windows, separate app popups/dialogs, GNOME menus, notifications, dock backgrounds, overview search/folder cards and the session lock screen. GTK4 context menus get a managed stylesheet block. Unknown native shapes fall back to tint rather than rectangular blur. High contrast, Reduce transparency and Power Saver behavior are preserved. The system login greeter is outside this project.

## Install

From this project's directory:

```sh
make package
gnome-extensions disable prism@local
gnome-extensions install --force dist/polished@local.shell-extension.zip
```

Log out and back in, then:

```sh
gnome-extensions enable polished@local
gnome-extensions prefs polished@local
```

Use one material extension at a time. Polished rejects activation when Prism is already active; keep Prism disabled while using Polished. Restart GTK4 apps after enabling or changing the look so their menus reload the user stylesheet.

Settings: enable, appearance, translucency preset, Custom strength, Low power mode (default off), optional top-bar indicator (default off), Automatic battery saving (default on), four battery-effect switches, and Reduce transparency. Presets are Subtle, Balanced, Airy (default), Mist and Custom. Restore recommended look changes appearance and density without resetting battery choices, the manual mode, or accessibility preferences.

**Power behavior:**

| Situation | App-window glass | Menu/notification glass | Dock glass | Overview blur |
| --- | --- | --- | --- | --- |
| AC, normal system power profile | On | On | On | On |
| Battery or system Power Saver, default battery choices | Off | On | Off | Off |
| Manual Low power mode | Off | Off | Off | Off |

In **Battery appearance**, turn each effect on or off independently. Turn off **Automatic battery saving** to keep the full glass look regardless of power source. Full glass returns automatically when AC power resumes and system Power Saver is no longer active. The translucency preset and battery choices are never rewritten during transitions. Battery detection uses UPower property changes; there is no polling. If the power service is unavailable, detection falls back to normal glass rather than guessing.

**Low power mode** is the manual override for battery life or demanding ML workloads. It keeps native app opacity, dense unblurred floating surfaces, native overview rendering and the quiet styling. Disable it to return to the automatic glass/battery behavior. Internally it retains the earlier `smooth-performance` settings key for compatibility; existing saved preferences are preserved across upgrades. If **Reduce transparency** is enabled, turn it off to see Polished styling again. Native lock-screen behavior remains separate.

Open preferences through the Extensions app, or run `gnome-extensions prefs polished@local`. Enable **Show Polished in the top bar** if you want its panel menu. Battery, network, recording and other native indicators remain available.

**Quiet palette:** In preferences, choose **Use wallpaper** to apply the bundled light/dark landscape pair. It follows the desktop’s color scheme. **Restore previous** restores the saved wallpaper settings while preserving later changes made in system Settings. Wallpaper application is explicit and persists when the extension is disabled; enabling or restoring the recommended look never applies it automatically.

**Window layouts:** With an app focused, press **Super+Alt+C** to center it without resizing, or **Super+Alt+M** to center it at a comfortable size with breathing room around it. Actions use the current monitor’s usable work area, including displays to the left/above the primary monitor. Fullscreen apps, dialogs and popups are excluded. Centering preserves maximized windows; Comfortable size restores them. App size constraints remain enforced by Mutter. New windows retain their native placement. To change or disable a shortcut, edit the `polished-center-window` or `polished-comfortable-window` string array using this extension’s schema; an empty array disables it.

No global fonts, accent, animation speed or application launchers are modified. Adjust font/accent with the normal desktop tools. Dense text windows can use Subtle or Reduce transparency. Native keyboard focus rings are retained.

## Validation and limits

```sh
make check check-runtime-api check-frost-gpu
make check-wallpapers
```

Includes compiled-schema tests, actual native API/CSS parsing, GTK ownership/restoration, typography/accent handling, per-window focus/input/corner lifecycles, workspace and drag cache reuse, blur storage/geometry, Power Saver and accessibility, actual GLSL pixel tests on surfaceless Mesa, window-layout geometry/actions, shortcut cleanup, and wallpaper backup/restoration. `check-wallpapers` additionally renders both SVG assets through the native image loader, which needs a working session D-Bus connection.

Live desktop appearance, frame times, hardware power use and GPU memory use have not been verified in this workspace. Tests do not establish smoothness on every device. While glass surfaces are visible, the redraw guard can increase repaint bandwidth on some setups. Battery savings and frame-time improvements have not been measured on real hardware. GPU memory is bounded per cache, not by a global byte budget; this release does not guarantee a 600 MB total. Cached snapshots refresh on release, focus, popup reopening or the panel's Refresh cached backgrounds action. Background detail stretches softly during a resize, then updates on release.

In glass mode, whole-client translucency also affects text/images. Arbitrary app internals cannot universally be rethemed by a compositor extension. Polished unifies their surrounding material and supported menus, retaining toolkit layouts and input regions.

## Undo

```sh
gnome-extensions disable polished@local
```

This restores owned styles, original client opacity, native effects and GTK rules while preserving unrelated user CSS. Restart GTK4 applications. To return to Prism:

```sh
gnome-extensions enable prism@local
```
