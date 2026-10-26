import GLib from 'gi://GLib';
const [, bytes] = GLib.file_get_contents('polished@local/redrawGuard.js');
const source = new TextDecoder().decode(bytes).replace(/^import .*;\n/gm, '').replace('export class', 'class');
let drawFlags = 0, repaints = 0;
const api = {DrawDebugFlag: {DISABLE_CLIPPED_REDRAWS: 2},
    get_debug_flags: () => [0, drawFlags, 0],
    add_debug_flags: (_debug, draw) => { drawFlags |= draw; },
    remove_debug_flags: (_debug, draw) => { drawFlags &= ~draw; }};
const Guard = new Function('Clutter', source + '\nreturn RedrawGuard;')(api);
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
second.mapped = false; second.emit('notify::mapped');
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
print('Stable redraw ownership, visibility, lifecycle, and no-continuous-repaint checks passed');
