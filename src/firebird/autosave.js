// Activity revisions describe user input/contact, not every guest clock tick or LCD frame.
export function createAutosave(save, failed, timers = globalThis) {
  let revision = 1, committed = 0, lastInput = timers.performance.now(), lastSave = lastInput;
  let timer, work, contact = false, stopped = false;
  function schedule() {
    timers.clearTimeout(timer);
    if (stopped || work || contact || revision === committed) return;
    const delay = Math.max(lastSave + 30000, lastInput + 2000) - timers.performance.now();
    timer = timers.setTimeout(() => {
      run().catch(problem => { if (!stopped) failed(problem); });
    }, Math.max(0, delay));
  }
  function run() {
    if (work) return work;
    const saving = revision;
    lastSave = timers.performance.now();
    work = (async () => { await save(); committed = saving; })().finally(() => { work = undefined; schedule(); });
    return work;
  }
  schedule();
  return {
    changed(activeContact) {
      if (stopped) return;
      revision++; lastInput = timers.performance.now();
      if (activeContact !== undefined) contact = activeContact;
      schedule();
    },
    async flush(shouldContinue = () => true) {
      timers.clearTimeout(timer);
      // A save already in progress may precede input queued just before the page hides.
      while (!stopped && revision !== committed && shouldContinue()) await run();
      schedule();
    },
    stop() { stopped = true; timers.clearTimeout(timer); },
  };
}
