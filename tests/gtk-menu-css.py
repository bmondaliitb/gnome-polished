import json
import gi
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk
with open('/tmp/polished-gtk-menu-samples.json') as stream:
    samples = json.load(stream)
for css in samples:
    provider = Gtk.CssProvider()
    errors = []
    provider.connect('parsing-error', lambda _p, _s, error: errors.append(str(error)))
    provider.load_from_data(css.encode())
    assert not errors, '\n'.join(errors)
print('GTK4 parser accepts dark/light menu styles and opacity variants')
