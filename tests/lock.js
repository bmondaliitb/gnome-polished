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
const Material = new Function('GLib', 'St', 'global', source + '\nreturn LockMaterial;')(
    loop, {ThemeContext: {get_for_stage: () => theme}}, {stage: {}});
const shield = new Actor();
let permitted = false;
const material = new Material(shield, () => permitted);
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
assert(dialog._promptBox.opacity === 0 && dialog._promptBox.style.includes('rgba(25,28,35,0.70)'),
    'Native prompt animation opacity is preserved while its backing is translucent');
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
assert(dialog._promptBox.style === null && dialog.signals.size === 0, 'Opt-out restores the prompt and disconnects dialog observers');
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

