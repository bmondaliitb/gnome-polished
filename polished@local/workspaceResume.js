import GLib from 'gi://GLib';

// Keep the first settled workspace frame free of material updates. Coalesce
// the follow-up into one low-priority task, cancellable by a new switch/disable.
export class WorkspaceResume {
    constructor(stage, resume, loop = GLib) {
        this._stage = stage;
        this._resume = resume;
        this._loop = loop;
        this._paint = 0;
        this._source = 0;
    }

    schedule() {
        if (this._paint || this._source) return;
        this._paint = this._stage.connect('after-paint', () => {
            this._stage.disconnect(this._paint);
            this._paint = 0;
            this._source = this._loop.idle_add(this._loop.PRIORITY_LOW, () => {
                this._source = 0;
                this._resume();
                return this._loop.SOURCE_REMOVE;
            });
        });
    }

    cancel() {
        if (this._paint) this._stage.disconnect(this._paint);
        if (this._source) this._loop.source_remove(this._source);
        this._paint = 0;
        this._source = 0;
    }
}
