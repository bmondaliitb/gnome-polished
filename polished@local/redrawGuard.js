import Clutter from 'gi://Clutter';

// Backdrop capture reads more than the current damage clip. Until capture can
// participate in Mutter's damage tracking, clipped monitor redraws can feed old
// composited pixels back into the blur. Disable clipping only while live frost
// is mapped. This does not schedule continuous frames or disable occlusion.
export class RedrawGuard {
    constructor(repaint = () => {}, api = Clutter) {
        this._api = api;
        this._repaint = repaint;
        this._actors = new Map();
        this._enabled = true;
        this._owned = false;
        this._suspended = false;
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        this._sync();
    }

    setSuspended(suspended) {
        this._suspended = suspended;
        this._sync();
    }

    track(actor, active) {
        if (!active) { this.untrack(actor); return; }
        if (this._actors.has(actor)) return;
        const ids = [actor.connect('notify::mapped', () => this._sync()),
            actor.connect('destroy', () => this.untrack(actor))];
        this._actors.set(actor, ids);
        this._sync();
    }

    untrack(actor) {
        const ids = this._actors.get(actor);
        if (!ids) return;
        this._actors.delete(actor);
        for (const id of ids) actor.disconnect(id);
        this._sync();
    }

    _sync() {
        const needed = this._enabled && !this._suspended && [...this._actors.keys()].some(actor => actor.is_mapped());
        const flag = this._api.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS;
        if (needed) {
            const [, draw] = this._api.get_debug_flags();
            if (!(draw & flag)) {
                this._api.add_debug_flags(0, flag, 0);
                this._owned = true;
                this._repaint();
            }
        } else if (this._owned) {
            // Preserve pre-existing flags and any unrelated flags added later.
            this._api.remove_debug_flags(0, flag, 0);
            this._owned = false;
            this._repaint();
        }
    }

    destroy() {
        this._enabled = false;
        for (const actor of [...this._actors.keys()]) this.untrack(actor);
        this._sync();
    }
}
