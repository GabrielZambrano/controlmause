// ControlMause - ayudante de Mac (JavaScript for Automation, viene con macOS).
// Lee ordenes por stdin y genera eventos reales de raton y teclado con CoreGraphics.
// Se ejecuta con: osascript -l JavaScript helpers/mac-inject.js
//
// Entrada:
//   MOVE <x> <y>                  mover el cursor (puntos de pantalla)
//   BTN <L|R|M> <D|U>             boton del raton en la posicion actual
//   WHEEL <dy> <dx>               rueda (en lineas, positivo = arriba / izquierda)
//   KEY <keycode> <D|U>           tecla (codigo de tecla de Mac)
//   RESET                         soltar todo lo que siga presionado
// Salida:
//   READY <ancho> <alto>
ObjC.import('Cocoa');
ObjC.import('CoreGraphics');

// Valores de CoreGraphics (fijos para no depender del puente de constantes).
const EV = { LDOWN: 1, LUP: 2, RDOWN: 3, RUP: 4, MOVED: 5, LDRAG: 6, RDRAG: 7,
  KDOWN: 10, KUP: 11, FLAGS: 12, SCROLL: 22, ODOWN: 25, OUP: 26, ODRAG: 27 };
const FIELD_CLICK_STATE = 1;
const FIELD_BUTTON_NUMBER = 3;
const FIELD_SCROLL_Y = 11;
const FIELD_SCROLL_X = 12;
const HID_TAP = 0;

const FLAG = { SHIFT: 0x20000, CONTROL: 0x40000, OPTION: 0x80000, COMMAND: 0x100000, CAPS: 0x10000 };
const MODIFIER_KEYS = {
  0x38: FLAG.SHIFT, 0x3c: FLAG.SHIFT,
  0x3b: FLAG.CONTROL, 0x3e: FLAG.CONTROL,
  0x3a: FLAG.OPTION, 0x3d: FLAG.OPTION,
  0x37: FLAG.COMMAND, 0x36: FLAG.COMMAND,
};

function run() {
  const stdin = $.NSFileHandle.fileHandleWithStandardInput;
  const stdout = $.NSFileHandle.fileHandleWithStandardOutput;
  const emit = (s) => stdout.writeData($(s + '\n').dataUsingEncoding($.NSUTF8StringEncoding));

  const bounds = $.CGDisplayBounds($.CGMainDisplayID());
  const width = bounds.size.width;
  const height = bounds.size.height;

  let x = width / 2;
  let y = height / 2;
  let buttons = { L: false, R: false, M: false };
  let heldKeys = {};
  let modCount = {};      // cuantas teclas mantienen cada modificador
  let caps = false;
  let lastClick = { t: 0, btn: '', x: 0, y: 0, count: 0 };

  // Un solo evento de raton reutilizado para no acumular memoria.
  const mouse = $.CGEventCreateMouseEvent(null, EV.MOVED, { x: x, y: y }, 0);
  let scroll = null;

  function flags() {
    let f = caps ? FLAG.CAPS : 0;
    for (const k in modCount) if (modCount[k] > 0) f |= Number(k);
    return f;
  }

  function postMouse(type, button, clickState) {
    $.CGEventSetType(mouse, type);
    $.CGEventSetLocation(mouse, { x: x, y: y });
    $.CGEventSetIntegerValueField(mouse, FIELD_BUTTON_NUMBER, button);
    $.CGEventSetIntegerValueField(mouse, FIELD_CLICK_STATE, clickState || 0);
    $.CGEventSetFlags(mouse, flags());
    $.CGEventPost(HID_TAP, mouse);
  }

  function move(nx, ny) {
    x = Math.max(0, Math.min(width - 1, nx));
    y = Math.max(0, Math.min(height - 1, ny));
    if (buttons.L) postMouse(EV.LDRAG, 0);
    else if (buttons.R) postMouse(EV.RDRAG, 1);
    else if (buttons.M) postMouse(EV.ODRAG, 2);
    else postMouse(EV.MOVED, 0);
  }

  function button(which, down) {
    const num = which === 'L' ? 0 : which === 'R' ? 1 : 2;
    const type = which === 'L' ? (down ? EV.LDOWN : EV.LUP)
      : which === 'R' ? (down ? EV.RDOWN : EV.RUP)
        : (down ? EV.ODOWN : EV.OUP);
    if (down) {
      // Doble clic: mismo boton, cerca y en menos de 400 ms.
      const now = Date.now();
      const near = Math.abs(x - lastClick.x) < 5 && Math.abs(y - lastClick.y) < 5;
      lastClick.count = (now - lastClick.t < 400 && lastClick.btn === which && near) ? lastClick.count + 1 : 1;
      lastClick.t = now; lastClick.btn = which; lastClick.x = x; lastClick.y = y;
    }
    buttons[which] = down;
    postMouse(type, num, lastClick.count);
  }

  function wheel(dy, dx) {
    if (!scroll) {
      scroll = $.CGEventCreate(null);
      $.CGEventSetType(scroll, EV.SCROLL);
    }
    $.CGEventSetLocation(scroll, { x: x, y: y });
    $.CGEventSetIntegerValueField(scroll, FIELD_SCROLL_Y, dy);
    $.CGEventSetIntegerValueField(scroll, FIELD_SCROLL_X, dx);
    $.CGEventSetFlags(scroll, flags());
    $.CGEventPost(HID_TAP, scroll);
  }

  function key(code, down) {
    const ev = $.CGEventCreateKeyboardEvent(null, code, down);
    if (MODIFIER_KEYS[code]) {
      const f = MODIFIER_KEYS[code];
      modCount[f] = Math.max(0, (modCount[f] || 0) + (down ? 1 : -1));
      $.CGEventSetType(ev, EV.FLAGS);
    } else if (code === 0x39) {
      if (!down) return;            // Bloq Mayus cambia de estado al presionar
      caps = !caps;
      $.CGEventSetType(ev, EV.FLAGS);
    }
    if (down) heldKeys[code] = true; else delete heldKeys[code];
    $.CGEventSetFlags(ev, flags());
    $.CGEventPost(HID_TAP, ev);
  }

  function reset() {
    for (const b of ['L', 'R', 'M']) if (buttons[b]) button(b, false);
    for (const code of Object.keys(heldKeys)) key(Number(code), false);
    modCount = {};
  }

  function handle(line) {
    const p = line.trim().split(' ');
    switch (p[0]) {
      case 'MOVE': move(Number(p[1]), Number(p[2])); break;
      case 'BTN': button(p[1], p[2] === 'D'); break;
      case 'WHEEL': wheel(Number(p[1]) | 0, Number(p[2]) | 0); break;
      case 'KEY': key(Number(p[1]), p[2] === 'D'); break;
      case 'RESET': reset(); break;
    }
  }

  emit('READY ' + width + ' ' + height);
  try {
    ObjC.import('ApplicationServices');
    if (!$.AXIsProcessTrusted()) emit('NOACCESS');
  } catch (e) {}

  let buf = '';
  for (;;) {
    const data = stdin.availableData;      // espera hasta que llegue algo
    if (data.length === 0) break;          // Node se cerro
    buf += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try { handle(line); } catch (e) { console.log('error: ' + e); }
    }
  }
  reset();
}
