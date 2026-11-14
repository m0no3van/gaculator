const clamp = value => Math.max(0, Math.min(1, value));

export function createTouchpadGesture(send, tap) {
  let gesture;
  function position(event) {
    const { rect } = gesture;
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 6) gesture.moved = true;
    gesture.point = position(event);
    send({ ...gesture.point, contact: true, down: false });
  }
  return {
    get pointerId() { return gesture?.id; },
    start(event, rect) {
      if (gesture || event.button !== 0 || event.isPrimary === false || rect.width <= 0 || rect.height <= 0
        || event.clientX < rect.left || event.clientX > rect.left + rect.width
        || event.clientY < rect.top || event.clientY > rect.top + rect.height) return false;
      gesture = { id: event.pointerId, rect, startX: event.clientX, startY: event.clientY, moved: false };
      gesture.point = position(event);
      send({ ...gesture.point, contact: true, down: false });
      return true;
    },
    move,
    end(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      move(event);
      if (!gesture.moved) {
        if (tap) {
          // Release tracking contact before a queued hardware direction/modifier chord.
          send({ ...gesture.point, contact: false, down: false, cancel: true }); tap(gesture.point);
        } else send({ ...gesture.point, contact: true, down: true });
      }
      send({ ...gesture.point, contact: false, down: false });
      gesture = null;
    },
    cancel(event) {
      if (!gesture || (event && event.pointerId !== gesture.id)) return;
      send({ ...gesture.point, contact: false, down: false, cancel: true }); gesture = null;
    },
  };
}

// Pace moves on the guest clock; fast swipes must not wrap Firebird's int8 deltas.
export function createTouchpadInput(core) {
  let current, target, ending, nextTick = 0;
  const reset = () => { current = target = ending = null; nextTick = 0; };
  function flush() {
    const now = core._fb_ticks();
    if (!current || now < nextTick) return;
    const x = current.x + Math.max(-0.08, Math.min(0.08, target.x - current.x));
    const y = current.y + Math.max(-0.08, Math.min(0.08, target.y - current.y));
    const arrived = Math.abs(x - target.x) < 0.000001 && Math.abs(y - target.y) < 0.000001;
    const down = arrived && target.down;
    core._fb_touch(x, y, 1, down ? 1 : 0);
    current = { x, y }; nextTick = now + (down ? 10 : 2);
    if (arrived && ending) ending.releaseAt = nextTick;
  }
  return {
    get active() { return !!current; },
    receive(data) {
      if (data.cancel) { core._fb_touch(0.5, 0.5, 0, 0); reset(); return; }
      if (![data.x, data.y].every(Number.isFinite)) return;
      const point = { x: clamp(data.x), y: clamp(data.y), down: !!data.down };
      if (data.contact) {
        target = point; ending = null;
        if (!current) {
          current = { x: point.x, y: point.y }; nextTick = core._fb_ticks() + 2;
          core._fb_touch(point.x, point.y, 1, 0);
        }
      } else if (current) ending = {};
    },
    flush() {
      if (ending?.releaseAt !== undefined && core._fb_ticks() >= ending.releaseAt) {
        core._fb_touch(current.x, current.y, 0, 0); reset(); return;
      }
      flush();
    },
    reset,
  };
}
