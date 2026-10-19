/** Buffer stream events while REST is in flight (including the response-to-render interval). */
export class SnapshotEvents<T> {
  loading = false;
  private events: Array<{ event: T; seq: number }> = [];
  private floor = -1;

  begin(): void {
    this.loading = true;
  }
  reset(): void {
    this.events = [];
    this.floor = -1;
    this.begin();
  }
  push(event: T, seq: number): boolean {
    if (seq <= this.floor) return true;
    if (!this.loading) return false;
    this.events.push({ event, seq });
    return true;
  }
  finish(seq: number): T[] {
    this.loading = false;
    this.floor = Math.max(this.floor, seq);
    const events = this.events.filter((e) => e.seq > seq).sort((a, b) => a.seq - b.seq);
    this.events = [];
    return [...new Map(events.map((e) => [e.seq, e.event])).values()];
  }
}
