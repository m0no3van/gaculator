// Safari switch clicks can have detail=0 too; track the pointer activation instead.
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
      if (event.button !== 0) return;
      timers.clearTimeout(cleanup); pointerHandled = true;
      activate();
    },
    fallback() {
      const handled = pointerHandled; reset();
      if (handled) return;
      activate();
    },
    keyboard: reset,
    cancel(nativeSwitch) {
      // WebKit switches dispatch a default click/change synchronously on touchcancel.
      if (nativeSwitch && pointerHandled) consumeDefault(); else reset();
    },
    consumeDefault,
    reset,
  };
}
