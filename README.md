# Polished Desktop

A separate GNOME Shell **50** extension, UUID `polished@local`, for a calmer, coherent desktop. It builds on Prism's tested cached material renderer, with an independent schema, GObject types, CSS classes, shader uniforms and GTK stylesheet ownership. Prism's files and preferences are unchanged.

## The look

- **Glass by default:** On normal AC power, the desktop uses the full cached glass treatment. Airy keeps focused app clients at 96% opacity, background windows at least 98%, and dialogs at least 99%; Custom spans 92–100%. Battery appearance independently controls app-window glass, floating menu/notification glass, dock glass and overview blur.
- **Visible, quiet glass:** Floating menus, calendar, notifications, Alt+Tab switchers and dock use lighter background tint weights while preserving native text/icon coverage and transparent shadow margins. The Airy preset targets about 68% menu tint, 73% notification tint and 60% dock tint. A slightly gentler dark veil and faint glass-edge highlight reveal more blurred background color. The lock-screen password panel uses a 64% backing at Airy. Dense presets retain their clarity advantage; app-window opacity, capture frequency and blur radius are unchanged. Low power and battery-disabled effects keep their dense fallback.
- **Gentle separation:** a subtle active-window rim, much quieter inactive edges, faint surface hairlines, soft menu/card shadows and a rounded dock rim. Shell glass follows native painted coverage, keeping transparent margins and shadow padding clear rather than adding a backing slab around popups. Window shadows remain Mutter's native shadows. Decorative actors never pick or handle input.
- **Coordinated color:** neutral light/dark surfaces, quiet hover states, restrained accent selection in GTK4 menus, and the native theme accent for Shell selection. The wallpaper remains the user's own source of background color. The top bar shares the neutral palette and desktop font; workspace-dot paint follows its contrast decision while retaining native geometry and animation; Manual Low power mode gives it a steady, readable backing. An optional pair of quiet landscape wallpapers coordinates with both appearances.
- **Typography and spacing:** material menus and overview follow the desktop font, including size and absolute pixel units. Shell and GTK menu rows share 8×12 px padding and 10 px rounded highlights; overview list rows follow the same rhythm, with coordinated notification spacing. Hover, selection and pressed states follow the same quiet hierarchy across menus, overview and the window switcher. Notification and search titles use a clearer medium-weight hierarchy; timestamps and descriptions stay quieter. Tooltips, notifications, dialogs and menus share a small set of corner radii and soft shadows. App typography and internal layouts remain native.
- **Smooth interaction:** Cached glass never uses a live blur timer and freezes captures during dragging and workspace transitions. Focus changes update only affected window families; inherited hover/style changes do not trigger whole-Shell refreshes. When app-window and dock glass are off, no per-frame workspace-motion observer is installed. Turning off overview blur uses native overview rendering with no additional wallpaper/tint layers. The first frame after a workspace slide retains cached materials; focus/geometry updates resume in one cancellable low-priority task after that frame. Unrelated workspace clone groups do not trigger whole-Shell material refreshes, and resuming a slide does not rearm hidden captures. Native animation and keyboard-focus behavior remain intact.

Alt+Tab app/window switchers use cached background blur, including in light appearance where their native light labels retain a coordinated dark backing. They follow the menu-glass battery choice and Low power mode. Tooltips and OSD remain tint-only.

Supported surfaces include normal windows, separate app popups/dialogs, GNOME menus, notifications, dock backgrounds, overview search/folder cards and the session lock screen. GTK4 context menus share one paired palette across Files, Terminal and other supported apps. Light GTK menus keep a 94% backing floor so the underlying app does not turn the same menu into a different shade. Their active managed block is written last, preserving older theme blocks and user CSS verbatim while preventing stale Prism rules from mixing a dark backing with light-menu labels. GTK4 context menus get a managed stylesheet block that pairs the backing with explicit label/icon colors, including disabled items, so a dark application cannot leave white text on a light menu. Unknown native shapes fall back to tint rather than rectangular blur. High contrast, Reduce transparency and Power Saver behavior are preserved. The system login greeter is outside this project.

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

**Low power mode** is the manual override for battery life or demanding ML workloads. It keeps native app opacity, dense unblurred floating surfaces, native overview rendering and the quiet styling. Disable it to return to the automatic glass/battery behavior. Internally it retains the earlier `smooth-performance` settings key for compatibility; existing saved preferences are preserved across upgrades. If **Reduce transparency** is enabled, turn it off to see Polished styling again. The lock-screen password view also drops its native wallpaper blur in Low power mode or when battery menu glass is disabled; its prompt uses a denser backing.

Open preferences through the Extensions app, or run `gnome-extensions prefs polished@local`. Enable **Show Polished in the top bar** if you want its panel menu. Battery, network, recording and other native indicators remain available.

**Quiet palette:** In preferences, choose **Use wallpaper** to apply the bundled light/dark landscape pair. It follows the desktop’s color scheme. **Restore previous** restores the saved wallpaper settings while preserving later changes made in system Settings. Wallpaper application is explicit and persists when the extension is disabled; enabling or restoring the recommended look never applies it automatically.

**Window layouts:** With an app focused, press **Super+Alt+C** to center it without resizing, or **Super+Alt+M** to center it at a comfortable size with breathing room around it. Actions use the current monitor’s usable work area, including displays to the left/above the primary monitor. Fullscreen apps, dialogs and popups are excluded. Centering preserves maximized windows; Comfortable size restores them. App size constraints remain enforced by Mutter. New windows retain their native placement. Choose **Edit…** beside either shortcut in preferences to record a new combination, disable it, or restore its default. Changes apply only after **Apply**. The editor checks the other layout and standard GNOME window-manager/media shortcuts for conflicts; shortcuts registered privately by applications or other extensions may not be discoverable. The `polished-center-window` and `polished-comfortable-window` string arrays remain available for advanced configuration.

No global fonts, accent, animation speed or application launchers are modified. Adjust font/accent with the normal desktop tools. Dense text windows can use Subtle or Reduce transparency. Native keyboard focus rings are retained.

## Validation and limits

```sh
make check check-runtime-api check-frost-gpu
make check-wallpapers
make check-gtk-contrast # optional: computed GTK colors; requires a desktop display
```

Includes compiled-schema tests, actual native API/CSS parsing, GTK ownership/restoration, typography/accent handling, per-window focus/input/corner lifecycles, workspace and drag cache reuse, blur storage/geometry, Power Saver and accessibility, actual GLSL pixel tests on surfaceless Mesa, capture-scoped redraw/culling cleanup, deferred capture timing and steady-state uniform/binding reuse, window-layout geometry/actions, shortcut cleanup, and wallpaper backup/restoration. `check-wallpapers` additionally renders both SVG assets through the native image loader, which needs a working session D-Bus connection.

Live desktop appearance, frame times, hardware power use and GPU memory use have not been verified in this workspace. Tests do not establish smoothness on every device. Fresh snapshots briefly request complete backing frames and temporary window culling protection. Both are released after the capture frame, even for unpainted/occluded windows; steady cached glass does not retain those overrides. Transform changes discovered during paint reuse the previous snapshot until a complete backing frame is prepared. Unchanged shader uniforms and backdrop bindings are not uploaded again on every paint. Battery savings and frame-time improvements have not been measured on real hardware. Retained backdrop snapshots share a 256 MiB estimated-memory target, including RGBA capture textures and blur intermediates. Old hidden snapshots are reclaimed first, including when a surface becomes unmapped. All snapshots of mapped surfaces are protected to avoid mixed-monitor recapture thrashing; the visible working set may exceed the target. This is not a hard GPU-memory cap: native foreground textures, driver storage and overview blur are outside this accounting. Detaching a managed effect releases its snapshot records and backing texture binding. Pending captures are admitted at most two surfaces per frame, prioritizing floating surfaces and focused windows, while other surfaces reuse existing glass until their turn. Cached snapshots refresh on release, focus, popup reopening or the panel's Refresh cached backgrounds action. Background detail stretches softly during a resize, then updates on release.

In glass mode, whole-client translucency also affects text/images. Arbitrary app internals cannot universally be rethemed by a compositor extension. Polished unifies their surrounding material and supported menus, retaining toolkit layouts and input regions.

## Session lock screen

The session lock screen shares the desktop font, a quieter medium-weight clock, softer date hierarchy, neutral notification cards, subtle hairlines and an 18 px card / 24 px password-panel radius. The password view keeps the native blurred wallpaper behind its translucent panel; no desktop-window snapshots or extra blur actors are introduced. Low power mode and the battery menu-glass choice also control password-view blur. The clock view retains the native wallpaper source without blur.

Authentication, password visibility, notification privacy, focus, accessibility controls, time format and GNOME's transitions remain native. Styling is scoped to the session's lock dialog and is restored on opt-out or disable. High contrast and Reduce transparency continue to suspend the treatment. The GDM login screen before signing in is a separate session. A CSS-only update for the already-installed login companion is provided in [integration/login](integration/login/README.md), including matching account-name rows and entry states; it requires a separate system-file installation.

## Optional diagnostics

In preferences, enable **Record glass diagnostics**, reproduce the interaction you want to inspect, then disable it for a summary. View GNOME Shell journal messages with:

```sh
journalctl --user -b _COMM=gnome-shell --grep='Polished diagnostics'
```

Reports include capture/cache-hit counts, capture frames, deferred surface requests, mean/maximum CPU submission time and an estimate of retained snapshot memory at the latest capture. Longer sessions also report every 120 captures. Diagnostics default off and use no polling or refresh timer. CPU submission timings do not measure GPU execution, FPS, animation smoothness or battery use. Counts contain no window titles or application contents.

Fractional-scale capture coverage is regression-tested at 100%, 125%, 150%, 175% and 200%, including clipped monitor edges. Native text sizes, icon targets and logical CSS spacing remain unchanged. Appearance on actual mixed-monitor configurations still requires visual comparison.

## Undo

```sh
gnome-extensions disable polished@local
```

This restores owned styles, original client opacity, native effects and GTK rules while preserving unrelated user CSS. Restart GTK4 applications. To return to Prism:

```sh
gnome-extensions enable prism@local
```
