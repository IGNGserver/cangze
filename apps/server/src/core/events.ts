import { EventEmitter } from 'node:events';

/** Minimal typed event bus for in-process fan-out between modules. */
export class EventBus<Events extends Record<string, unknown>> {
  private readonly emitter = new EventEmitter({ captureRejections: false });

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  on<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  emit<K extends keyof Events & string>(event: K, payload: Events[K]): void {
    for (const l of this.emitter.listeners(event)) {
      try {
        (l as (p: Events[K]) => void)(payload);
      } catch (err) {
        console.error(`event listener for ${event} failed`, err);
      }
    }
  }
}
