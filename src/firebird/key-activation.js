// Pointer input is committed on press; clicks are only a keyboard/assistive fallback.
export function createKeyActivation(activate, timers = globalThis) {
  let pointerHandled = false, cleanup;
  const reset = () => { timers.clearTimeout(cleanup); pointerHandled = false; };
  function consumeDefault() {
    timers.clearTimeout(cleanup); pointerHandled = true;
    cleanup = timers.setTimeout(() => { pointerHandled = false; }, 0);
  }
  return {
    markPointer() { timers.clearTimeout(cleanup); pointerHandled = true; },
    pointerDown(event) {
      if (event.button !== 0 || (event.isPrimary === false && event.pointerType !== 'touch')) return;
      timers.clearTimeout(cleanup); pointerHandled = true;
      activate();
    },
    fallback(event) {
      const handled = pointerHandled; reset();
      if (handled || event?.pointerType || event?.detail > 0 || event?.sourceCapabilities?.firesTouchEvents) return;
      activate();
    },
    keyboard: reset,
    cancel() {
      if (pointerHandled) consumeDefault(); else reset();
    },
    consumeDefault,
    reset,
  };
}
