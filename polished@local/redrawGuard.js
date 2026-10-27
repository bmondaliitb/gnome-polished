import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

// A fresh screen capture needs complete backing pixels. Cached glass does not.
// Keep broad redraws and per-window culling protection only for capture frames,
// then release them after painting has finished rather than during traversal.
export class RedrawGuard {
    constructor(repaint = () => {}, api = Clutter, stage = global.stage) {
        this._api = api;
        this._repaint = repaint;
        this._actors = new Map();
        this._enabled = true;
        this._owned = false;
        this._suspended = false;
        this._settleSource = 0;
        this._stage = stage;
        this._paintSignals = [];
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        if (enabled) this._rearm();
        this._sync();
        this._settle();
    }

    setSuspended(suspended) {
        this._suspended = suspended;
        if (!suspended) this._rearm();
        this._sync();
        this._settle();
    }

    track(actor, active, effect = null, protect = null) {
        if (!active) { this.untrack(actor); return; }
        const saved = this._actors.get(actor);
        if (saved?.effect === effect) return;
        if (saved) this.untrack(actor);
        const record = {effect, protect, requested: effect ? effect.needsCapture : true, prepared: false, ids: [
            actor.connect('notify::mapped', () => {
                if (effect?.needsCapture) record.requested = true;
                this._sync();
            }),
            actor.connect('destroy', () => this.untrack(actor)),
        ]};
        this._actors.set(actor, record);
        if (effect) effect.captureChanged = () => {
            record.requested = effect.needsCapture;
            this._sync();
            if (record.requested && actor.is_mapped()) this._repaint();
        };
        this._sync();
    }

    untrack(actor) {
        const saved = this._actors.get(actor);
        if (!saved) return;
        if (saved.effect) {
            saved.effect.captureChanged = null;
            saved.effect.captureAllowed = false;
        }
        saved.protect?.(false);
        for (const id of saved.ids) actor.disconnect(id);
        this._actors.delete(actor);
        this._sync();
        this._settle();
    }

    _pending(actor, saved) {
        return this._enabled && !this._suspended && actor.is_mapped() &&
            (saved.effect ? saved.requested && saved.effect.needsCapture : true);
    }

    _sync() {
        let needed = false;
        for (const [actor, saved] of this._actors) {
            if (this._pending(actor, saved)) { needed = true; break; }
        }
        const flag = this._api.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS;
        if (needed) {
            const [, draw] = this._api.get_debug_flags();
            if (!(draw & flag)) {
                this._api.add_debug_flags(0, flag, 0);
                this._owned = true;
                this._repaint();
            }
        }
        if (needed && this._paintSignals.length === 0) {
            this._paintSignals = [
                this._stage.connect('before-paint', () => {
                    for (const [actor, saved] of this._actors) {
                        if (!this._pending(actor, saved)) continue;
                        saved.prepared = true;
                        saved.protect?.(true);
                        if (saved.effect) saved.effect.captureAllowed = true;
                    }
                }),
                this._stage.connect('after-paint', () => this._settle()),
            ];
        }
        if (!needed) this._queueSettle();
    }

    _queueSettle() {
        if (this._settleSource) return;
        this._settleSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._settleSource = 0;
            this._settle();
            return GLib.SOURCE_REMOVE;
        });
    }

    _rearm() {
        for (const saved of this._actors.values()) {
            if (saved.effect?.needsCapture) saved.requested = true;
        }
    }

    _settle() {
        if (this._settleSource) GLib.source_remove(this._settleSource);
        this._settleSource = 0;
        let needed = false;
        for (const [actor, saved] of this._actors) {
            if (saved.prepared && saved.effect) saved.requested = false;
            saved.prepared = false;
            saved.protect?.(false);
            if (saved.effect) saved.effect.captureAllowed = false;
            needed ||= this._pending(actor, saved);
        }
        if (!needed && this._owned) {
            // Preserve flags set before Polished and unrelated debugging flags.
            this._api.remove_debug_flags(0, this._api.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS, 0);
            this._owned = false;
            this._repaint();
        }
        if (!needed) {
            for (const id of this._paintSignals) this._stage.disconnect(id);
            this._paintSignals = [];
        }
    }

    destroy() {
        this._enabled = false;
        for (const actor of [...this._actors.keys()]) this.untrack(actor);
        this._settle();
    }
}
