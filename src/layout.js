// Lleva la posicion del cursor dentro de la Mac mientras se controla desde Windows,
// y decide cuando hay que volver a Windows.
//
// side = lado en el que esta la Mac respecto a las pantallas de Windows.
//   'left'   -> se entra a la Mac por su borde derecho y se vuelve saliendo por el derecho.
//   'right'  -> se entra por su borde izquierdo y se vuelve por el izquierdo.
//   'top'    -> la Mac esta arriba: se entra por su borde de abajo y se vuelve por abajo.
//   'bottom' -> la Mac esta abajo: se entra por su borde de arriba y se vuelve por arriba.

const SIDES = ['left', 'right', 'top', 'bottom'];

class RemoteCursor {
  /**
   * @param {object} o
   * @param {number} o.graceMs  tiempo justo despues de entrar a la Mac en el que no se vuelve
   *   a Windows: al cruzar el borde el raton suele "temblar" hacia atras y rebotaba al instante.
   */
  constructor({ side = 'left', speed = 1, graceMs = 400, now = Date.now } = {}) {
    if (!SIDES.includes(side)) throw new Error(`"macSide" debe ser ${SIDES.join(', ')} (no "${side}").`);
    this.side = side;
    this.speed = speed;
    this.graceMs = graceMs;
    this.now = now;
    this.enteredAt = 0;
    this.width = 0;
    this.height = 0;
    this.x = 0;
    this.y = 0;
    this.active = false;
  }

  get vertical() {
    return this.side === 'top' || this.side === 'bottom';
  }

  setScreen(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Entrar a la Mac en la misma posicion relativa (0..1) del borde por el que se salio de Windows. */
  enter(fraction) {
    this.active = true;
    this.enteredAt = this.now();
    const f = clamp(fraction, 0, 1);
    if (this.vertical) {
      this.x = f * (this.width - 1);
      this.y = this.side === 'top' ? this.height - 1 : 0;
    } else {
      this.x = this.side === 'left' ? this.width - 1 : 0;
      this.y = f * (this.height - 1);
    }
    return { x: Math.round(this.x), y: Math.round(this.y) };
  }

  /**
   * Aplica un movimiento relativo.
   * @returns {{x:number,y:number}|{leave:number}} nueva posicion, o la fraccion del borde para volver
   */
  move(dx, dy) {
    let nx = this.x + dx * this.speed;
    let ny = this.y + dy * this.speed;
    const maxX = this.width - 1;
    const maxY = this.height - 1;
    let leaving;
    const settling = this.now() - this.enteredAt < this.graceMs;
    if (this.vertical) {
      nx = clamp(nx, 0, maxX);
      leaving = this.side === 'top' ? ny > maxY : ny < 0;
      if (leaving && !settling) return this.leave(maxX > 0 ? nx / maxX : 0.5);
    } else {
      ny = clamp(ny, 0, maxY);
      leaving = this.side === 'left' ? nx > maxX : nx < 0;
      if (leaving && !settling) return this.leave(maxY > 0 ? ny / maxY : 0.5);
    }
    this.x = clamp(nx, 0, maxX);
    this.y = clamp(ny, 0, maxY);
    return { x: Math.round(this.x), y: Math.round(this.y) };
  }

  leave(fraction) {
    this.active = false;
    return { leave: fraction };
  }

  /** En que borde de Windows esta la Mac. */
  windowsEdge() {
    return this.side;
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

const SIDE_NAMES = { left: 'izquierdo', right: 'derecho', top: 'de arriba', bottom: 'de abajo' };

module.exports = { RemoteCursor, SIDES, SIDE_NAMES };
