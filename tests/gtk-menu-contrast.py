"""Optional computed-style check; requires a desktop display, shows no windows."""
import json
import gi
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk, Gio, Gdk
Gtk.init()
display = Gdk.Display.get_default()
assert display, 'A desktop display is required'
with open('/tmp/polished-gtk-menu-samples.json') as stream:
    samples = json.load(stream)
# Reproduce a terminal whose own theme explicitly paints child labels white.
app = Gtk.CssProvider()
app.load_from_data(b'window label, window image { color: white; }')
Gtk.StyleContext.add_provider_for_display(display, app, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
for dark, marker, expected in [(False, 'rgba(236,239,244,', (28,30,40)),
                                (True, 'rgba(25,28,35,', (242,242,242))]:
    css = next(text for text in samples if marker in text)
    provider = Gtk.CssProvider()
    provider.load_from_data(css.encode())
    Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
    window = Gtk.Window()
    button = Gtk.MenuButton()
    window.set_child(button)
    actions = Gio.SimpleActionGroup()
    actions.add_action(Gio.SimpleAction.new('copy', None))
    disabled = Gio.SimpleAction.new('disabled', None)
    disabled.set_enabled(False)
    actions.add_action(disabled)
    window.insert_action_group('test', actions)
    menu = Gio.Menu()
    menu.append('Copy', 'test.copy')
    menu.append('Unavailable', 'test.disabled')
    popover = Gtk.PopoverMenu.new_from_model(menu)
    button.set_popover(popover)
    def walk(widget):
        yield widget
        child = widget.get_first_child()
        while child:
            yield from walk(child)
            child = child.get_next_sibling()
    contents = next(widget for widget in walk(popover) if widget.get_css_name() == 'contents')
    snapshot = Gtk.Snapshot()
    snapshot.render_background(contents.get_style_context(), 0, 0, 320, 200)
    node = snapshot.to_node()
    serialized = bytes(node.serialize().get_data()).decode().replace(' ', '').replace('\n','')
    # Snapshot the actual computed backing, rather than infer it from label color.
    expected_bg = 'rgba(25,28,35,0.85)' if dark else 'rgba(236,239,244,0.94)'
    assert expected_bg in serialized, (dark, expected_bg, serialized)
    labels = {widget.get_label(): widget for widget in walk(popover) if isinstance(widget, Gtk.Label)}
    for text in ['Copy', 'Unavailable']:
        color = labels[text].get_color()
        actual = tuple(round(value * 255) for value in (color.red, color.green, color.blue))
        assert actual == expected, (dark, text, actual, expected)
        assert abs(color.alpha - (0.4 if text == 'Unavailable' else 1)) < 0.01, (text, color.alpha)
    window.destroy()
    Gtk.StyleContext.remove_provider_for_display(display, provider)
Gtk.StyleContext.remove_provider_for_display(display, app)
print('GTK rendered backgrounds and computed foregrounds pass for light/dark menus in a white-label terminal theme, including disabled rows; no windows shown')
