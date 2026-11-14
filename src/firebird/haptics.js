export function keyFeedback(name) {
  if (name === 'enter' || name === 'ret') return 'confirm';
  if (/^(?:n\d|a[a-z]|dot|comma|space|neg|ee|pi)$/.test(name)) return 'entry';
  if (['plus', 'minus', 'mult', 'div', 'pow', 'squ', 'exp', 'pow10', 'equ', 'pleft', 'pright'].includes(name)) return 'operation';
  return 'control';
}

const patterns = { entry: 4, operation: 8, control: 12, confirm: [12, 20, 12], touchpad: 3, reload: [30, 40, 30] };
export function vibrateFeedback(kind, nav = globalThis.navigator) {
  try { return typeof nav?.vibrate === 'function' && nav.vibrate(patterns[kind] ?? patterns.control); }
  catch { return false; }
}

export function supportsSwitchHaptics(nav = globalThis.navigator, doc = globalThis.document) {
  return !!(nav?.maxTouchPoints > 0 && typeof nav.vibrate !== 'function' && doc && 'switch' in doc.createElement('input'));
}
