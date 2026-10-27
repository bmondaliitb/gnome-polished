import Gtk from 'gi://Gtk?version=4.0';
import {shortcutConflict} from '../polished@local/shortcutEditor.js';
function assert(value, message) { if (!value) throw new Error(message); }
const own = {get_strv: key => key === 'polished-center-window' ? ['<Super><Alt>c'] : ['<Super><Alt>m']};
assert(!shortcutConflict('<Alt><Super>c', 'polished-center-window', own), 'Current assignment is allowed');
assert(shortcutConflict('<Alt><Super>m', 'polished-center-window', own), 'Equivalent reordered modifiers conflict with another layout');
const system = {settings_schema: {list_keys: () => ['system-action']}, get_value: () => ({deep_unpack: () => ['<Control><Alt>t']})};
assert(shortcutConflict('<Alt><Control>t', 'polished-center-window', own, [system]), 'System shortcut conflicts are detected');
assert(!shortcutConflict('', 'polished-center-window', own, [system]), 'Clearing an assignment is allowed');
assert(!shortcutConflict('<Super><Alt>p', 'polished-center-window', own, [system]), 'Unused shortcut is accepted');
for (const name of ['accelerator_parse', 'accelerator_name', 'accelerator_get_default_mod_mask', 'accelerator_valid'])
    assert(typeof Gtk[name] === 'function', 'Native GTK shortcut API available: ' + name);
print('Shortcut normalization, layout/system conflict detection and GTK shortcut APIs passed');
// Exercise editor state and saves without a display or a real desktop shortcut.
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
const [, bytes] = GLib.file_get_contents('polished@local/shortcutEditor.js');
const source = new TextDecoder().decode(bytes).replace(/^import .*;\n/gm, '').replace(/export /g, '');
let dialog;
class Widget {
    constructor(properties = {}) { Object.assign(this, properties); this.children = []; this.signals = {}; }
    append(child) { this.children.push(child); }
    set_child(child) { this.child = child; }
    connect(signal, callback) { this.signals[signal] = callback; }
    add_css_class() {}
    add_controller(controller) { this.controller = controller; }
    present() { dialog = this; }
    close() { this.closed = true; }
    click() { this.signals.clicked(); }
}
const FakeGtk = {...Gtk, Window: Widget, Box: Widget, Label: Widget, ShortcutLabel: Widget,
    Button: Widget, EventControllerKey: Widget};
// GI namespace properties are not enumerable on all supported GJS releases.
for (const name of ['Orientation', 'Align', 'PropagationPhase', 'accelerator_parse', 'accelerator_name',
    'accelerator_valid', 'accelerator_get_default_mod_mask']) FakeGtk[name] = Gtk[name];
const editor = new Function('Gtk', 'Gdk', 'Gio', 'Adw', source + '\nreturn editShortcut;')(
    FakeGtk, Gdk, {SettingsSchemaSource: {get_default: () => ({lookup: () => false})}}, {Toast: Widget});
let assignment = ['<Super><Alt>c'], saves = 0, toasts = 0;
const settings = {get_strv: key => key === 'polished-center-window' ? assignment : ['<Super><Alt>m'],
    set_strv: (_key, value) => { assignment = value; saves++; },
    get_default_value: () => ({deep_unpack: () => ['<Super><Alt>c']})};
const parent = {add_toast() { toasts++; }};
const open = () => editor(parent, settings, 'polished-center-window', 'Center window');
const press = (key, modifiers = 0) => dialog.controller.signals['key-pressed'](null, key, 0, modifiers);
const buttons = () => dialog.child.children[3].children;
open();
assert(!buttons()[3].sensitive && saves === 0, 'Opening editor cannot change a shortcut');
press(Gdk.KEY_m, Gdk.ModifierType.SUPER_MASK | Gdk.ModifierType.ALT_MASK);
assert(!buttons()[3].sensitive && saves === 0, 'Conflicting capture disables Apply');
press(Gdk.KEY_p, Gdk.ModifierType.SUPER_MASK | Gdk.ModifierType.ALT_MASK);
assert(buttons()[3].sensitive && saves === 0, 'Captured shortcut remains a draft until Apply');
buttons()[3].click();
assert(saves === 1 && dialog.closed && toasts === 1 && assignment[0].includes('p'), 'Apply saves once and closes');
open(); press(Gdk.KEY_BackSpace);
assert(saves === 1 && buttons()[3].sensitive, 'Backspace stages a clear without saving');
press(Gdk.KEY_Escape);
assert(dialog.closed && saves === 1, 'Escape cancels draft changes');
open(); buttons()[1].click(); buttons()[3].click();
assert(assignment.length === 0 && saves === 2, 'Disable clears the assignment only after Apply');
open(); buttons()[2].click(); buttons()[3].click();
assert(assignment[0].includes('c') && saves === 3, 'Use default stages and applies the schema default');
print('Shortcut editor capture, draft, conflict, Apply, Disable, default and cancellation passed');
