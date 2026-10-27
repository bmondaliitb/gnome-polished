import GLib from 'gi://GLib';
const [, bytes] = GLib.file_get_contents('polished@local/redrawGuard.js');
const source = new TextDecoder().decode(bytes).replace(/^import .*;\n/gm, '').replace('export class', 'class');
let drawFlags = 0, repaints = 0;
const api = {DrawDebugFlag: {DISABLE_CLIPPED_REDRAWS: 2},
    get_debug_flags: () => [0, drawFlags, 0],
    add_debug_flags: (_debug, draw) => { drawFlags |= draw; },
    remove_debug_flags: (_debug, draw) => { drawFlags &= ~draw; }};
const idleCallbacks=new Map();let idleId=0;
const loop={PRIORITY_DEFAULT_IDLE:0,SOURCE_REMOVE:false,
    idle_add:(_priority,callback)=>{idleCallbacks.set(++idleId,callback);return idleId;},
    source_remove:id=>idleCallbacks.delete(id)};
const stage={handlers:new Map(),next:0,
    connect(name,callback){this.handlers.set(++this.next,[name,callback]);return this.next;},
    disconnect(id){this.handlers.delete(id);},
    emit(name){for(const [signal,callback]of [...this.handlers.values()])if(name===signal)callback();}};
function flush(){for(const [id,callback]of [...idleCallbacks]){idleCallbacks.delete(id);callback();}}
const Guard = new Function('Clutter','GLib','global', source + '\nreturn RedrawGuard;')(api,loop,{stage});
function assert(value, message) { if (!value) throw new Error(message); }
class Actor {
    constructor(mapped) { this.mapped = mapped; this.signals = new Map(); this.next = 0; }
    is_mapped() { return this.mapped; }
    connect(name, callback) { this.signals.set(++this.next, [name, callback]); return this.next; }
    disconnect(id) { this.signals.delete(id); }
    emit(name) { for (const [signal, callback] of [...this.signals.values()]) if (signal === name) callback(); }
}
const guard = new Guard(() => repaints++);
const first = new Actor(false), second = new Actor(true);
guard.track(first, true);
assert(drawFlags === 0, 'Hidden frost does not change monitor redraw behavior');
first.mapped = true; first.emit('notify::mapped');
assert(drawFlags === 2 && repaints === 1, 'Visible frost enables complete frames and clears existing artifacts once');
guard.track(second, true);
guard.track(second, true);
assert(repaints === 1 && second.signals.size === 2, 'Multiple surfaces do not schedule repeated repaints or duplicate handlers');
guard.setSuspended(true);
assert(drawFlags === 0, 'Workspace motion releases forced full-monitor redraws while capture is frozen');
guard.setSuspended(false);
assert(drawFlags === 2, 'Workspace completion restores artifact protection');
guard.untrack(first);
assert(drawFlags === 2, 'Removing one surface keeps protection for another');
second.mapped = false; second.emit('notify::mapped');flush();
assert(drawFlags === 0, 'Hiding the last surface restores clipped redraws');
second.mapped = true; second.emit('notify::mapped');
guard.setEnabled(false);
assert(drawFlags === 0, 'User can turn the compatibility mode off live');
guard.setEnabled(true);
drawFlags |= 16;
guard.destroy();
assert(drawFlags === 16 && second.signals.size === 0 && first.signals.size === 0,
    'Disable restores only the owned flag and releases actor handlers');
drawFlags = 2;
const existing = new Guard();
existing.track(first, true);
existing.destroy();
assert(drawFlags === 2, 'A pre-existing flag from another owner is preserved');
drawFlags = 0;
const destroyed = new Guard();
destroyed.track(first, true);
first.emit('destroy');
assert(drawFlags === 0 && first.signals.size === 0, 'Destroying the last surface releases protection');
drawFlags=0;
const captures=new Guard(),surface=new Actor(true);
const effect={needsCapture:true,captureAllowed:false,captureChanged:null};let protectedWindow=false;
captures.track(surface,true,effect,value=>protectedWindow=value);
assert(drawFlags===2&&!effect.captureAllowed&&!protectedWindow,'A capture requests a full frame without copying from the current partial frame');
stage.emit('before-paint');
assert(effect.captureAllowed&&protectedWindow,'Capture and window culling protection activate before the next full paint');
effect.needsCapture=false;effect.captureChanged();
assert(drawFlags===2&&protectedWindow,'A completed snapshot never changes global draw flags or window effects during paint');
stage.emit('after-paint');
assert(drawFlags===0&&!protectedWindow,'After-paint releases capture overrides without waiting for an idle callback');flush();
assert(drawFlags===0&&!effect.captureAllowed&&!protectedWindow&&stage.handlers.size===0,
    'Cached glass releases full-monitor redraws, native-window effects and stage hooks after painting');
effect.needsCapture=true;effect.captureChanged();stage.emit('before-paint');
// An occluded/offscreen surface may not actually paint in this frame.
stage.emit('after-paint');flush();
assert(drawFlags===0&&effect.needsCapture&&!effect.captureAllowed&&stage.handlers.size===0,
    'An unpainted window cannot keep full redraws or frame observers enabled indefinitely');
captures.setSuspended(true);captures.setSuspended(false);
assert(drawFlags===0&&stage.handlers.size===0,'Workspace resume does not rearm an unpainted snapshot or request a full redraw');
effect.captureChanged();stage.emit('before-paint');
assert(effect.captureAllowed,'A later paint can request another complete capture frame');
effect.needsCapture=false;effect.captureChanged();stage.emit('after-paint');flush();
captures.destroy();
assert(!effect.captureChanged&&!surface.signals.size&&!idleCallbacks.size&&!stage.handlers.size,
    'Capture observers, queued cleanup and stage handlers are fully released');
print('Stable redraw ownership, visibility, lifecycle, and no-continuous-repaint checks passed');
const batch = new Guard(() => repaints++);
const waiting = Array.from({length: 5}, () => ({actor: new Actor(true), effect: {needsCapture: true}}));
for (const {actor, effect} of waiting) batch.track(actor, true, effect);
let frames = 0;
while (waiting.some(({effect}) => effect.needsCapture)) {
    stage.emit('before-paint'); frames++;
    const admitted = waiting.filter(({effect}) => effect.captureAllowed);
    assert(admitted.length <= 2 && admitted.length > 0, 'Each capture frame admits at most two surfaces and makes progress');
    for (const {effect} of admitted) { effect.needsCapture = false; effect.captureChanged(); }
    stage.emit('after-paint'); flush();
    assert(frames < 5, 'Deferred requests cannot stall indefinitely');
}
assert(frames === 3, 'Five simultaneous surfaces are spread over three frames');
batch.destroy(); flush();
assert(stage.handlers.size === 0 && drawFlags === 0, 'Batch completion releases redraw and stage hooks');
const priorityGuard = new Guard();
const priorityActors = Array.from({length: 3}, () => new Actor(true));
priorityActors[0].meta_window = {has_focus: () => false};
priorityActors[1].meta_window = {has_focus: () => true};
const priorityEffects = priorityActors.map(() => ({needsCapture: true}));
priorityActors.forEach((actor, index) => priorityGuard.track(actor, true, priorityEffects[index]));
stage.emit('before-paint');
assert(!priorityEffects[0].captureAllowed && priorityEffects[1].captureAllowed && priorityEffects[2].captureAllowed,
    'Floating surfaces and the focused window are admitted before background windows');
priorityGuard.setSuspended(true);
assert(priorityEffects.every(effect => !effect.captureAllowed), 'Motion cancels prepared batch permissions');
priorityGuard.destroy(); flush();
