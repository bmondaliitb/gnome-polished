// Checks public methods in the actual installed GNOME/Mutter typelib; no stage needed.
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import St from 'gi://St';
import GdkPixbuf from 'gi://GdkPixbuf';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import {BackdropRefreshEffect} from '../polished@local/backdropRefreshEffect.js';
function check(type, names) {
    for (const name of names)
        if (typeof type.prototype[name] !== 'function') throw new Error(`${type.name}.${name} is not exposed to GJS`);
}
GObject.type_class_ref(Meta.Display);
for (const name of ['grab-op-begin', 'grab-op-end']) {
    const signal = GObject.signal_lookup(name, Meta.Display);
    if (!signal || GObject.type_name(GObject.signal_query(signal).param_types[0]) !== 'MetaWindow')
        throw new Error(`Missing native window-grab signal ${name}`);
}
check(Meta.Window, ['allows_move', 'allows_resize', 'is_maximized', 'unmaximize', 'is_override_redirect',
    'get_work_area_current_monitor', 'move_frame', 'move_resize_frame']);
GObject.type_class_ref(Clutter.Stage);
for(const signal of ['before-paint','after-paint'])
    if(!GObject.signal_lookup(signal,Clutter.Stage))throw new Error('Missing stage capture lifecycle signal '+signal);
check(Clutter.PaintContext, ['get_framebuffer']);
check(Clutter.Actor, ['continue_pick', 'get_size', 'get_resource_scale', 'get_paint_opacity']);
check(Clutter.Actor, ['continue_paint', 'add_effect', 'remove_effect']);
check(Clutter.Effect, ['get_actor', 'queue_repaint']);
check(Clutter.Actor, ['is_mapped']);
check(Clutter.Actor, ['is_in_clone_paint']);
check(St.Widget, ['has_style_class_name', 'add_style_class_name', 'remove_style_class_name']);
const theme = new St.Theme();
const stylesheet = Gio.File.new_for_path('polished@local/stylesheet.css');
theme.load_stylesheet(stylesheet);
theme.unload_stylesheet(stylesheet);
for (const method of ['get_debug_flags', 'add_debug_flags', 'remove_debug_flags'])
    if (typeof Clutter[method] !== 'function') throw new Error(`Missing ${method}`);
if (!Clutter.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS) throw new Error('Missing redraw compatibility flag');
for (const [object, methods] of [[Gio.DBusProxy, ['new_for_bus', 'new_for_bus_finish']],
    [GdkPixbuf.Pixbuf, ['new_from_stream_at_scale_async', 'new_from_stream_finish']]])
    for (const method of methods) if (typeof object[method] !== 'function') throw new Error(`Missing experience API ${method}`);
check(Cogl.Framebuffer, ['draw_textured_rectangle', 'orthographic', 'set_viewport', 'blit', 'allocate', 'get_context', 'get_width', 'get_height', 'get_modelview_matrix', 'get_projection_matrix', 'get_viewport_x', 'get_viewport_y', 'get_viewport_width', 'get_viewport_height']);
check(Cogl.Pipeline, ['add_snippet', 'get_uniform_location', 'set_uniform_float', 'set_layer_texture', 'set_layer_combine', 'set_layer_filters', 'set_layer_wrap_mode', 'set_blend']);
check(Clutter.OffscreenEffect, ['get_pipeline', 'get_texture']);
check(Shell.GLSLEffect, ['add_glsl_snippet']);
for (const [type, method] of [[Cogl.Pipeline, 'new'], [Cogl.Snippet, 'new'], [Cogl.Texture2D, 'new_with_size'], [Cogl.Offscreen, 'new_with_texture']])
    if (typeof type[method] !== 'function') throw new Error(`Missing ${method}`);
const refresh = new BackdropRefreshEffect();
if (!(refresh instanceof Clutter.Effect)) throw new Error('Backdrop refresh guard is not a Clutter effect');
print('Rounded-frost API contract matches the installed GNOME/Mutter typelib');
