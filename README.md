# Polished Desktop

A separate GNOME Shell **50** extension, UUID `polished@local`, for a calmer, coherent desktop. It builds on Prism's tested cached material renderer, with an independent schema, GObject types, CSS classes, shader uniforms and GTK stylesheet ownership. Prism's files and preferences are unchanged.

## The look

- **Clear foregrounds:** Airy is the default, with 86% client opacity rather than Prism's 79%. Background windows use at least 94%; dialogs at least 96%. This limits background competition and preserves more text contrast. Custom spans 80–92% focused-client opacity.
- **Gentle separation:** one-pixel translucent rims above app clients, quieter inactive edges, soft menu/card shadows and a rounded dock rim. Window shadows remain Mutter's native shadows. Decorative actors never pick or handle input.
- **Coordinated color:** neutral light/dark surfaces, quiet hover states, restrained accent selection in GTK4 menus, and the native theme accent for Shell selection. The wallpaper remains the user's own source of background color. Top-bar foreground contrast follows wallpaper brightness.
- **Typography and spacing:** material menus and overview follow the desktop font, including size and absolute pixel units. Floating menu rows have consistent padding and rounded highlights. App typography and internal layouts remain native.
- **Smooth interaction:** cached backdrop blur, progressive downsampling, a bounded reduced-image filter, no live blur timer, frozen snapshots while dragging/resizing and during workspace transitions. Native GNOME animation and keyboard-focus behavior are retained.

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

Settings: enable, appearance, translucency preset, Custom strength, automatic power saving, Reduce transparency. Presets are Subtle, Balanced, Airy (default), Mist and Custom. Restore returns appearance to Follow desktop and density to Airy without changing master enable or Reduce transparency.

No global fonts, accent, wallpaper, animation speed or application launchers are modified. Adjust wallpaper/font/accent with the normal desktop tools. Dense text windows can use Subtle or Reduce transparency. Native keyboard focus rings are retained.

## Validation and limits

```sh
make check check-runtime-api check-frost-gpu
```

Includes compiled-schema tests, actual native API/CSS parsing, GTK ownership/restoration, typography/accent handling, per-window focus/input/corner lifecycles, workspace and drag cache reuse, blur storage/geometry, Power Saver and accessibility, and actual GLSL pixel tests on surfaceless Mesa.

Live desktop appearance, frame times, hardware power use and GPU memory use have not been verified in this workspace. Tests do not establish smoothness on every device. The redraw guard still increases repaint bandwidth on some setups. GPU memory is bounded per cache, not by a global byte budget; this release does not guarantee a 600 MB total. Cached snapshots refresh on release, focus, popup reopening or the panel's Refresh cached backgrounds action. Background detail stretches softly during a resize, then updates on release.

Whole-client translucency also affects text/images. Arbitrary app internals cannot universally be rethemed by a compositor extension. Polished unifies their surrounding material and supported menus, retaining toolkit layouts and input regions.

## Undo

```sh
gnome-extensions disable polished@local
```

This restores owned styles, original client opacity, native effects and GTK rules while preserving unrelated user CSS. Restart GTK4 applications. To return to Prism:

```sh
gnome-extensions enable prism@local
```

## Source placement in this session

The requested sibling directory `../gnome-polished` was read-only under the session filesystem policy. This complete standalone project is staged at `gnome-material/gnome-polished`. From `gnome-material`, copy it into the requested folder with:

```sh
cp -a gnome-polished/. ../gnome-polished/
```

Then run the install commands from that sibling folder.
