import GLib from 'gi://GLib';
import {surfacePalette} from '../polished@local/materials.js';
import {materialValues} from '../polished@local/simpleProfile.js';
const [, bytes] = GLib.file_get_contents('polished@local/overviewMaterial.js');
const source = new TextDecoder().decode(bytes).replace(/^import .*;\n/gm, '').replace('export class', 'class');
function assert(value, message) { if (!value) throw new Error(message); }
class Actor {
    constructor(properties = {}) {
        Object.assign(this, properties); this.children = []; this.signals = new Map();
        this.next = 0; this.style = null; this.effects = []; this.content = {}; this.classes = new Set();
    }
    connect(name, callback) { this.signals.set(++this.next, [name, callback]); return this.next; }
    disconnect(id) { this.signals.delete(id); }
    emit(name) { for (const [signal, callback] of [...this.signals.values()]) if (name === signal) callback(); }
    get_style() { return this.style; }
    has_style_class_name(name) { return this.classes.has(name); }
    add_style_class_name(name) { this.classes.add(name); }
    remove_style_class_name(name) { this.classes.delete(name); }
    set_style(style) { this.style = style; this.emit('notify::style'); }
    add_constraint() {}
    add_child(child) { child.parent = this; this.children.push(child); }
    insert_child_at_index(child, index) { child.parent = this; this.children.splice(index, 0, child); }
    add_effect(effect) { this.effects.push(effect); }
    remove_effect(effect) { this.effects = this.effects.filter(item => item !== effect); }
    destroy() {
        this.emit('destroy');
        for (const child of [...this.children]) child.destroy();
        if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this);
        this.signals.clear();
    }
}
let created = 0, destroyed = 0;
class Manager extends Actor {
    constructor(params) {
        super(); created++; this.params = params;
        this.backgroundActor = new Actor(); params.container.add_child(this.backgroundActor);
    }
    destroy() { destroyed++; this.backgroundActor.destroy(); this.signals.clear(); }
}
const Material = new Function('Clutter', 'Shell', 'Background', 'VisualBackdrop', 'surfacePalette', source + '\nreturn OverviewMaterial;')(
    {BindConstraint: class {}, BindCoordinate: {ALL: 0}},
    {BlurMode: {ACTOR: 0}, BlurEffect: class {constructor(params) { this.mode = params.mode; }}},
    {BackgroundManager: Manager}, Actor, surfacePalette);
const root = new Actor({visible: false, reactive: true});
root.set_style('background-color: #222222;');
const controls = new Actor({opacity: 255}); root.add_child(controls);
const layout = new Actor({overviewGroup: root, monitors: [{index: 0}, {index: 1}]});
let context = materialValues(50);
let permitted = true;
const material = new Material(layout, () => permitted, () => context);
assert(created === 0, 'Hidden overview does not eagerly allocate background actors');
assert(!root.has_style_class_name('polished-overview-material'), 'Hidden initial overview does not activate search styling');
root.visible = true; root.emit('notify::visible');
assert(created === 2 && root.children[1] === controls && controls.opacity === 255, 'Wallpaper is beneath controls, separately per monitor');
assert(root.has_style_class_name('polished-overview-material'), 'Material scope covers search providers including dynamically added results');
assert(material._layer.reactive === false && material._layer.can_focus === false && material._layer.track_hover === false,
    'Decorative overview layer cannot accept interaction');
assert(root.style.includes('background-color: transparent !important') && material._tint.style.includes('0.26'),
    'Opaque overview fill is replaced with an independently adjustable veil');
for (const record of material._records.values()) assert(record.effect.mode === 0 && record.effect.radius === 18,
    'Overview uses cached actor blur, not live backdrop capture, with the Eco radius cap');
root.visible = false; root.emit('notify::visible');
root.visible = true; root.emit('notify::visible');
assert(created === 2, 'Overview hide/show reuses wallpaper managers');
context = {...context, overviewOpacity: 10}; material.refresh();
assert(material._tint.style.includes('0.1') && controls.style === null && controls.opacity === 255,
    'Changing veil opacity leaves search/app controls unchanged');
assert([...material._records.values()].every(record => record.effect), 'Density changes reuse wallpaper blur');
context.smoothPerformance=true;material.refresh();
assert(!material._layer&&!material._tint&&material._managers.length===0&&material._records.size===0&&destroyed===2,
    'Smooth overview destroys duplicate wallpaper, tint and blur resources');
assert(created===2&&root.has_style_class_name('polished-overview-material')&&root.has_style_class_name('polished-overview-smooth'),
    'Smooth overview keeps refined search styling without creating wallpaper managers');
material.refresh();root.visible=false;root.emit('notify::visible');root.visible=true;root.emit('notify::visible');
layout.emit('monitors-changed');
assert(created===2&&root.children.length===1&&root.children[0]===controls&&
    !root.style.includes('background-color: transparent'),
    'Smooth show/hide and monitor changes keep native overview rendering with no extra layers');
context.smoothPerformance=false;material.refresh();
assert(!root.has_style_class_name('polished-overview-smooth')&&[...material._records].every(([actor,record])=>record.effect&&actor.effects.length===1),
    'Restoring glass reinstates exactly one overview effect per monitor');
layout.emit('monitors-changed');
assert(created === 6 && destroyed === 4, 'Monitor changes rebuild only glass-mode wallpaper resources');
context.smoothPerformance=true;material.refresh();
permitted = false; material.refresh();
assert(!root.has_style_class_name('polished-overview-smooth'),'Accessibility removes the owned smooth appearance class');
assert(!root.has_style_class_name('polished-overview-material'), 'Accessibility/disable restores native search backgrounds');
assert(root.style === 'background-color: #222222;' && root.children.length === 1 && root.children[0] === controls,
    'Accessibility/disable restores the original background and native controls');
material.destroy();
assert(root.signals.size === 0 && layout.signals.size === 0 && destroyed === 6, 'Disable disconnects signals and destroys every wallpaper manager');
const root2 = new Actor({visible: true});
root2.add_style_class_name('polished-overview-material');
root2.add_style_class_name('polished-overview-smooth');
const layout2 = new Actor({overviewGroup: root2, monitors: []});
const material2 = new Material(layout2, () => true, () => context);
material2.destroy();
assert(root2.has_style_class_name('polished-overview-material')&&root2.has_style_class_name('polished-overview-smooth'), 'Cleanup preserves a preexisting external scope class');
print('Overview material layering, cached blur, monitor lifecycle, opacity, and restoration checks passed');
