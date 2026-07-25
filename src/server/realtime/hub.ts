type Listener = (event: string, payload: unknown) => void;
const listeners = new Set<Listener>();
export const realtime = { subscribe(listener: Listener) { listeners.add(listener); return () => listeners.delete(listener); }, emit(event: string, payload: unknown) { for (const listener of listeners) listener(event, payload); } };
