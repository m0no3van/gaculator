// A long ON hold must never send the short ON tap before the reload confirmation.
export function createOnHold(tap, reload, threshold = () => {}, timers = globalThis) {
  let pointer, requestTimer;
  function cancel() {
    if (pointer) timers.clearTimeout(pointer.timer);
    timers.clearTimeout(requestTimer); requestTimer = undefined;
    pointer = null;
  }
  function start(event) {
    if (requestTimer !== undefined) cancel();
    if (pointer || event.isPrimary === false) { cancel(); return false; }
    if (event.button !== 0) return false;
    pointer = { id: event.pointerId, fired: false, started: timers.performance.now() };
    pointer.timer = timers.setTimeout(() => {
      pointer.fired = true;
      threshold();
    }, 5000);
    return true;
  }
  function end(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const fired = pointer.fired, elapsed = timers.performance.now() - pointer.started;
    cancel();
    if (fired || elapsed >= 5000) {
      if (!fired) threshold();
      // Finish release/default clicks before a native confirmation can receive input.
      requestTimer = timers.setTimeout(() => { requestTimer = undefined; reload(); }, 0);
    } else tap();
  }
  return {
    get pointerId() { return pointer?.id; }, start, end,
    startKey(event) {
      if (event.repeat || !['Enter', ' '].includes(event.key)) return false;
      return start({ pointerId: `key:${event.key}`, button: 0 });
    },
    endKey(event) { end({ pointerId: `key:${event.key}` }); },
    cancel,
  };
}
