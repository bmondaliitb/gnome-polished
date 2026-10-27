// Shared retained-snapshot target. Visible working sets are protected: exceeding
// the target is preferable to repeatedly evicting/repainting on-screen glass.
export class SnapshotBudget {
    constructor(limit = 256 * 1024 * 1024) {
        this.limit = limit;
        this.records = new Map();
        this.next = 0;
    }
    retain(owner, entry, bytes) {
        const token = ++this.next;
        this.records.set(token, {owner: new WeakRef(owner), entry: new WeakRef(entry), bytes});
        this.trim();
        return token;
    }
    touch(token) {
        const record = this.records.get(token);
        if (!record) return;
        this.records.delete(token);
        this.records.set(token, record);
    }
    forget(token) { this.records.delete(token); }
    trim() {
        let bytes = 0;
        const candidates = [];
        for (const [token, record] of this.records) {
            const owner = record.owner.deref(), entry = record.entry.deref();
            if (!owner || !entry) { this.records.delete(token); continue; }
            bytes += record.bytes;
            if (owner.canReleaseSnapshot(entry)) candidates.push([token, record, owner, entry]);
        }
        for (const [token, record, owner, entry] of candidates) {
            if (bytes <= this.limit) break;
            this.records.delete(token);
            owner.releaseSnapshot(entry);
            bytes -= record.bytes;
        }
        return bytes;
    }
}

// Timings describe CPU submission, not GPU execution or measured frame rate.
export class CaptureMetrics {
    constructor(clock = () => 0, report = message => console.info(message)) {
        this.clock = clock;
        this.report = report;
        this.enabled = false;
        this.reset();
    }
    reset() { this.captures = 0; this.hits = 0; this.totalUs = 0; this.maxUs = 0; this.frames = 0; this.deferred = 0; this.bytes = 0; }
    configure(enabled) {
        if (this.enabled === enabled) return;
        if (this.enabled) this.summary();
        this.enabled = enabled;
        this.reset();
        if (enabled) this.report('Polished diagnostics: enabled; capture times are CPU submission only');
    }
    start() { return this.enabled ? this.clock() : 0; }
    hit() { if (this.enabled) this.hits++; }
    frame(deferred) { if (this.enabled) { this.frames++; this.deferred += deferred; } }
    captured(start, bytes) {
        if (!this.enabled) return;
        const elapsed = Math.max(0, this.clock() - start);
        this.captures++; this.totalUs += elapsed; this.maxUs = Math.max(this.maxUs, elapsed);
        this.bytes = bytes;
        if (this.captures % 120 === 0) this.summary();
    }
    summary() {
        this.report(`Polished diagnostics: captures=${this.captures} cacheHits=${this.hits} captureFrames=${this.frames} deferred=${this.deferred} cpuMeanMs=${(this.totalUs / Math.max(1, this.captures) / 1000).toFixed(2)} cpuMaxMs=${(this.maxUs / 1000).toFixed(2)} retainedEstimateMiB=${((this.bytes ?? 0) / 1048576).toFixed(1)}`);
    }
}
export const snapshotBudget = new SnapshotBudget();
