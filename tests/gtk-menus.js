import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {GtkMenuStyle, gtkMenuCss, withoutManagedMenuCss} from '../polished@local/gtkMenus.js';
import {surfacePalette, MATERIAL_STATES} from '../polished@local/materials.js';
function assert(value, message) { if (!value) throw new Error(message); }
const directory = GLib.dir_make_tmp('polished-gtk-menus-XXXXXX');
const style = new GtkMenuStyle(directory);
const original = '/* existing user customization */\nbutton { padding: 7px; }';
GLib.file_set_contents(style.main.get_path(), original);
const read = file => new TextDecoder().decode(file.load_contents(null)[1]);
style.apply(gtkMenuCss(true, 85));
const selfContainedSample = read(style.main);
assert(read(style.main).includes('popover.menu.background > contents') && !read(style.main).includes('@import'), 'Forwarded GTK stylesheet is self-contained');
assert(withoutManagedMenuCss('/* BEGIN POLISHED GTK MENUS */\n@import url("polished-managed-menus.css");\n/* END POLISHED GTK MENUS */\n' + original) === original, 'Legacy import migrates without losing original rules');
assert(read(style.main).startsWith(original), 'Existing GTK rules preserved byte-for-byte');
assert(read(style.generated).includes('popover.menu.background > contents') && read(style.generated).includes('popover.menu button.model'), 'Modern GTK menu backgrounds and rows are both targeted');
assert(read(style.generated).includes(`rgba(${surfacePalette(true).background},0.85)`), 'Same dark palette and opacity as Shell menu');
for (const dark of [true, false]) {
    const css = gtkMenuCss(dark, 85), palette = surfacePalette(dark);
    assert(css.includes('popover.menu label, popover.menu image') && css.includes('modelbutton:disabled label'),
        'Menu descendants and disabled labels have explicit paired foregrounds');
    assert(css.includes(`rgba(${palette.edge})`), 'GTK menus share the Shell material edge palette');
    for (const [color,value] of [[palette.highlight,MATERIAL_STATES.hover],[palette.selection,MATERIAL_STATES.focus],[palette.selection,MATERIAL_STATES.pressed]])
        assert(css.includes(`rgba(${color},${value})`), 'GTK rows share the material interaction levels');
}
style.apply(gtkMenuCss(false, 65));
assert(read(style.main).split('BEGIN POLISHED GTK MENUS').length === 2, 'Exactly one managed import after updates');
assert(read(style.generated).includes('rgba(236,239,244,0.94)'), 'Appearance/opacity update');
const external = read(style.main) + '\nlabel { font-weight: bold; }';
GLib.file_set_contents(style.main.get_path(), external);
style.apply(null);
assert(read(style.main) === original + '\nlabel { font-weight: bold; }', 'Removal preserves subsequent user edits');
assert(!style.generated.query_exists(null), 'Owned generated file removed');
style.apply(null);
const originalAfter = read(style.main);
GLib.file_set_contents(style.generated.get_path(), '/* unrelated file */');
let rejected = false;
try { style.apply(gtkMenuCss(true, 85)); } catch { rejected = true; }
assert(rejected && read(style.main) === originalAfter && read(style.generated) === '/* unrelated file */', 'Unowned file is never overwritten');
style.generated.delete(null);
style.main.delete(null);
const linked = Gio.File.new_for_path(GLib.build_filenamev([directory, 'linked.css']));
GLib.file_set_contents(linked.get_path(), original);
style.main.make_symbolic_link(linked.get_path(), null);
rejected = false;
try { style.apply(gtkMenuCss(true, 85)); } catch { rejected = true; }
assert(rejected && read(linked) === original, 'Symlinked user stylesheet is never replaced');
style.main.delete(null); linked.delete(null); Gio.File.new_for_path(directory).delete(null);
const legacy = '/* BEGIN PRISM GTK MENUS */\npopover.menu.background > contents { background-color: rgb(25,28,35); color: white; }\npopover.menu modelbutton {color: white;}\n/* END PRISM GTK MENUS */\n';
const combinedDirectory = GLib.dir_make_tmp('polished-gtk-cascade-XXXXXX');
const combined = new GtkMenuStyle(combinedDirectory);
GLib.file_set_contents(combined.main.get_path(), legacy + original);
combined.apply(gtkMenuCss(false, 65));
const combinedLight = read(combined.main);
assert(combinedLight.startsWith(legacy + original) && combinedLight.indexOf('/* BEGIN POLISHED GTK MENUS */') > combinedLight.indexOf('END PRISM'),
    'Preserved legacy dark rules precede the active paired light palette');
combined.apply(gtkMenuCss(false, 65));
assert(read(combined.main) === combinedLight, 'Repeated application neither reorders nor duplicates preserved CSS');
combined.apply(null);
assert(read(combined.main) === legacy + original, 'Opt-out restores all preserved legacy and user CSS exactly');
combined.main.delete(null); Gio.File.new_for_path(combinedDirectory).delete(null);
const samples = [combinedLight, selfContainedSample, gtkMenuCss(true, 85), gtkMenuCss(false, 65), gtkMenuCss(true, 100)];
GLib.file_set_contents('/tmp/polished-gtk-menu-samples.json', JSON.stringify(samples));
print('GTK menu palette, inline block migration, updates, restoration, and file ownership checks passed');
