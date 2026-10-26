import GLib from 'gi://GLib';
import {clientSurfaceRoot} from '../polished@local/windowSurface.js';
function assert(value, message) { if (!value) throw new Error(message); }
const decoration = {type: 'OtherExtensionActor'};
const wayland = {type: 'MetaSurfaceContainerActorWayland'};
const x11 = {type: 'MetaSurfaceActorX11'};
assert(clientSurfaceRoot([decoration, wayland], actor => actor.type) === wayland, 'Wayland surface container found behind decorations');
assert(clientSurfaceRoot([decoration, x11], actor => actor.type) === x11, 'X11 surface found behind decorations');
assert(clientSurfaceRoot([decoration], actor => actor.type) === null, 'Unknown actor is never mistaken for the client');
const [, bytes] = GLib.file_get_contents('polished@local/backdrop.js');
const source = new TextDecoder().decode(bytes).replace(/^import .*;\n/gm, '').replace('export const', 'const');
const Backdrop = new Function('GObject', 'St', source + '\nreturn VisualBackdrop;')(
    {registerClass: (_meta, cls) => cls}, {Widget: class {}});
const backdrop = new Backdrop();
const calls = [];
const context = new Proxy({}, {get: (_target, method) => () => calls.push(method)});
backdrop.vfunc_pick(context);
assert(calls.length === 0, 'Decorative backdrop contributes no pick geometry');
print('Input isolation: native surface selection and zero decorative pick geometry passed');
