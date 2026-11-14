// A long ON hold must never send the short ON tap before the reload confirmation.
export function createOnHold(tap, reload, timers = globalThis) {
  let pointer;
  function cancel() {
    if (pointer) timers.clearTimeout(pointer.timer);
    pointer = null;
  }
  return {
    get pointerId() { return pointer?.id; },
    start(event) {
      if (pointer || event.isPrimary === false) { cancel(); return false; }
      if (event.button !== 0) return false;
      pointer = { id: event.pointerId, fired: false, started: timers.performance.now() };
      pointer.timer = timers.setTimeout(() => {
        pointer.fired = true;
        reload();
      }, 5000);
      return true;
    },
    end(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      const fired = pointer.fired, elapsed = timers.performance.now() - pointer.started;
      cancel();
      if (!fired) { if (elapsed >= 5000) reload(); else tap(); }
    },
    cancel,
  };
}
