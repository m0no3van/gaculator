// Physical matrix from Firebird keymap.h, pinned in third_party/firebird.
const matrix = `ret enter none neg space az ay n0 punct on none1
ax aw av n3 au at as n1 pi trig pow10
ar aq ap n6 ao an am n4 ee squ none2
al ak aj n9 ai ah ag n7 div exp none3
af ae ad none4 ac ab aa equ mult pow none5
none6 var minus pright dot pleft n5 cat metrix del pad
flag none7 plus doc n2 menu n8 esc none8 tab none9
none10 none11 none12 none13 none14 none15 none16 none17 shift ctrl comma`.split(/\s+/);
export const keyIds = Object.fromEntries(matrix.map((name, i) => [name, i]).filter(([name]) => !name.startsWith('none')));
const key = (name, label, legend = '') => ({ name, label, legend });
export const layout = {
  left: [key('esc', 'esc'), key('pad', 'pad', 'save'), key('tab', 'tab')],
  right: [key('on', '⌂on'), key('doc', 'doc', '+page'), key('menu', 'menu')],
  modifiers: [key('ctrl', 'ctrl'), key('shift', 'shift', 'CAPS'), key('var', 'var', 'sto→'), key('del', 'del', 'clear')],
  rows: [
    [key('equ', '=', '≠ ≥'), key('trig', 'trig', '?'), key('n7', '7'), key('n8', '8'), key('n9', '9'), key('metrix', '▥', ':='), key('cat', 'book', '∞ β °')],
    [key('pow', '^', 'ⁿ√'), key('squ', 'x²', '√'), key('n4', '4'), key('n5', '5'), key('n6', '6'), key('mult', '×', '"□"'), key('div', '÷')],
    [key('exp', 'eˣ', 'ln'), key('pow10', '10ˣ', 'log'), key('n1', '1'), key('n2', '2'), key('n3', '3'), key('plus', '+', '⇧ ∫'), key('minus', '−', '⇧ d/dx')],
    [key('pleft', '(', '['), key('pright', ')', '{'), key('n0', '0'), key('dot', '.', 'capture'), key('neg', '(−)', 'ans'), key('enter', 'enter', '≈')],
  ],
  alphabet: [
    [key('ee', 'EE'), ...'ABCDEFG'.split('').map(c => key('a' + c.toLowerCase(), c)), key('punct', '?!')],
    [key('pi', 'π'), ...'HIJKLMN'.split('').map(c => key('a' + c.toLowerCase(), c)), key('flag', '⚑')],
    [key('comma', ','), ...'OPQRSTU'.split('').map(c => key('a' + c.toLowerCase(), c)), key('ret', '↵')],
    [key('', ''), ...'VWXYZ'.split('').map(c => key('a' + c.toLowerCase(), c)), key('space', 'space')],
  ],
};

export const directions = { up: [0.5, 0], right: [1, 0.5], down: [0.5, 1], left: [0, 0.5], select: [0.5, 0.5] };

export function browserKey(event) {
  if (event.metaKey || event.altKey) return null;
  const { key, ctrlKey: ctrl = false, shiftKey = false } = event;
  if (key === '_' && shiftKey) return { name: 'minus', ctrl, shift: true };
  if (/^[a-z]$/i.test(key)) return { name: 'a' + key.toLowerCase(), ctrl, shift: shiftKey };
  if (/^[0-9]$/.test(key)) return { name: 'n' + key, ctrl, shift: false };
  const name = { Escape: 'esc', End: 'pad', Tab: 'tab', Home: 'on', PageUp: 'doc', PageDown: 'menu',
    Insert: 'var', Backspace: 'del', Delete: 'del', Enter: 'enter', ' ': 'space',
    '+': 'plus', '-': 'minus', '*': 'mult', '/': 'div', '=': 'equ', '^': 'pow', '.': 'dot', ',': 'comma',
    '(': 'pleft', ')': 'pright', '[': 'exp', ']': 'pow10', '\\': 'trig', "'": 'cat', ';': 'metrix',
    '`': 'neg', '|': 'pi', '<': 'ee', '?': 'punct', '>': 'flag',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[key];
  return name ? { name, ctrl, shift: !!shiftKey && (name === 'minus' || (name === 'plus' && event.code === 'NumpadAdd')) } : null;
}
