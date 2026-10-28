import {surfacePalette, configureMaterials} from '../polished@local/materials.js';
import GLib from 'gi://GLib';
function assert(value, message) { if (!value) throw new Error(message); }
class Actor {
    constructor(properties = {}) {
        Object.assign(this, properties); this.children = []; this.signals = new Map();
        this.next = 0; this.style = null;
    }
    connect(name, callback) { this.signals.set(++this.next, [name, callback]); return this.next; }
    disconnect(id) { this.signals.delete(id); }
    emit(name, child) { for (const [signal, callback] of [...this.signals.values()]) if (name === signal) callback(this, child); }
    has_style_class_name(name) { return (this.classes ?? new Set()).has(name); }
    add_style_class_name(name) { this.classes ??= new Set(); this.classes.add(name); }
    remove_style_class_name(name) { this.classes?.delete(name); }
    get_style() { return this.style; }
    set_style(style) { this.style = style; }
    get_children() { return this.children; }
    get_effect() { return this.effect; }
}
const [, bytes] = GLib.file_get_contents('polished@local/lockMaterial.js');
const source = new TextDecoder().decode(bytes).replace(/^import .*;\n/gm, '').replace('export class', 'class');
const callbacks = new Map(); let id = 0;
const loop = {PRIORITY_DEFAULT_IDLE: 0, SOURCE_REMOVE: false,
    idle_add: (_priority, callback) => { callbacks.set(++id, callback); return id; },
    source_remove: sourceId => callbacks.delete(sourceId)};
const theme = new Actor({scale_factor: 1});
const Material = new Function('GLib', 'St', 'global', 'surfacePalette', source + '\nreturn LockMaterial;')(
    loop, {ThemeContext: {get_for_stage: () => theme}}, {stage: {}}, surfacePalette);
const shield = new Actor();
let permitted = false;
let context = {};
configureMaterials({fontStyle: 'font-family: "Cantarell"; font-size: 11pt;'});
const material = new Material(shield, () => permitted, () => context);
function makeDialog() {
    const dialog = new Actor({_backgroundGroup: new Actor(), _promptBox: new Actor({visible: false, opacity: 0})});
    dialog._backgroundGroup.children = [new Actor({effect: {radius: 90, brightness: 0.65}})];
    return dialog;
}
const dialog = makeDialog(); shield._dialog = dialog;
permitted = true; material.refresh();
const background = dialog._backgroundGroup.children[0];
assert(background.effect.radius === 0 && background.effect.brightness === 1,
    'Clock uses the unchanged native wallpaper source without blur or dimming');
assert(dialog._promptBox.opacity === 0 && dialog._promptBox.style.includes('rgba(25,28,35,0.64)'),
    'Native prompt animation opacity is preserved while its backing is translucent');
assert(dialog.has_style_class_name('polished-lock-material') && dialog.style.includes('Cantarell'),
    'Lock styling is scoped to the active dialog and shares desktop typography');
dialog._promptBox.visible = true; dialog._promptBox.emit('notify::visible');
assert(background.effect.radius === 18 && background.effect.brightness === 0.78,
    'Password view reuses the native wallpaper blur with the Eco cap');
material.refresh(); material.refresh();
assert(background.effect.radius === 18 && material._effects.size === 1 && callbacks.size === 0,
    'Repeated refresh does not allocate effects, accumulate styling, or poll');
theme.scale_factor = 2; background.effect.radius = 180; background.effect.brightness = 0.65;
theme.emit('notify::scale-factor');
for (const [sourceId, callback] of [...callbacks]) { callbacks.delete(sourceId); callback(); }
assert(background.effect.radius === 36, 'Native resource scale is respected');
const monitor = new Actor({effect: {radius: 180, brightness: 0.65}});
dialog._backgroundGroup.children.push(monitor); dialog._backgroundGroup.emit('child-added', monitor);
for (const [sourceId, callback] of [...callbacks]) { callbacks.delete(sourceId); callback(); }
assert(monitor.effect.radius === 36 && material._effects.size === 2, 'New monitor backgrounds are updated without recreating wallpapers');
context = {smoothPerformance: true}; material.refresh();
assert(background.effect.radius === 0 && dialog._promptBox.style.includes('0.94'),
    'Low power mode keeps the quiet styling with a solid prompt and no lock blur');
context = {menuGlass: false}; material.refresh();
assert(background.effect.radius === 0, 'Battery menu-glass opt-out also suspends lock prompt blur');
context = {}; material.refresh();
const originalEffect = background.effect;
const replacementEffect = {radius: 120, brightness: 0.5};
background.effect = replacementEffect; material.refresh();
assert(originalEffect.radius === 180 && originalEffect.brightness === 0.65 && replacementEffect.radius === 36,
    'A replaced native blur releases and restores the old effect before tracking its replacement');
background.effect = originalEffect; material.refresh();
assert(replacementEffect.radius === 120 && replacementEffect.brightness === 0.5,
    'Replacement blur settings are restored independently of the original native effect');
permitted = false; material.refresh();
assert(background.effect.radius === 180 && monitor.effect.radius === 180 && background.effect.brightness === 0.65,
    'Opt-out restores the latest native scale-dependent blur values');
assert(dialog._promptBox.style === null && dialog.signals.size === 0 && dialog.style === null &&
    !dialog.has_style_class_name('polished-lock-material'), 'Opt-out restores the prompt and disconnects dialog observers');
permitted = true; material.refresh();
dialog._promptBox.set_style('external-style: kept;');
permitted = false; material.refresh();
assert(dialog._promptBox.style === 'external-style: kept;' && background.effect.radius === 180,
    'Accessibility suspension restores blur and preserves later external prompt styling');
shield._dialog = makeDialog(); permitted = true; material.refresh();
shield._dialog.emit('destroy');
assert(material._effects.size === 0 && material._dialog === null, 'Destroyed dialog releases all saved references');
material._queue(); material.destroy();
assert(callbacks.size === 0 && theme.signals.size === 0 && shield.signals.size === 0,
    'Disable cancels idle work and disconnects all lifetime signals');
print('Lock material wallpaper, native blur reuse, prompt opacity, monitor/scale, restoration, and cleanup checks passed');

// Class/style ownership is independent of the dialog's authentication lifetime.
shield._dialog = makeDialog();
const ownedDialog = shield._dialog;
ownedDialog.add_style_class_name('polished-lock-material');
ownedDialog.set_style('spacing: 7px;');
permitted = true;
const shared = new Material(shield, () => permitted);
assert(ownedDialog.style.includes('spacing: 7px;'), 'Existing dialog style survives shared typography application');
ownedDialog.set_style('spacing: 9px;');
shared.refresh();
permitted = false; shared.refresh();
assert(ownedDialog.style === 'spacing: 9px;' && ownedDialog.has_style_class_name('polished-lock-material'),
    'Restoration preserves external dialog edits and a pre-existing scope class');
shared.destroy();
