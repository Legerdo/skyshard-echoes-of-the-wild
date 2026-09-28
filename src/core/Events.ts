// Tiny typed event bus.

type Handler<T> = (payload: T) => void;

export class EventBus<EventMap extends Record<string, unknown>> {
  private handlers = new Map<keyof EventMap, Set<Handler<any>>>();

  on<K extends keyof EventMap>(evt: K, fn: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(evt);
    if (!set) {
      set = new Set();
      this.handlers.set(evt, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof EventMap>(evt: K, payload: EventMap[K]): void {
    const set = this.handlers.get(evt);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (e) {
        console.error('[event]', String(evt), e);
      }
    }
  }
}
