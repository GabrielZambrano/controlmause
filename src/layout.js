// Lleva la posicion del cursor dentro de la Mac mientras se controla desde Windows,
// y decide cuando hay que volver a Windows.
//
// side = lado en el que esta la Mac respecto a las pantallas de Windows.
//   'left'  -> se entra a la Mac por su borde derecho y se vuelve saliendo por el derecho.
//   'right' -> al reves.

class RemoteCursor {
  constructor({ side = 'left', speed = 1 } = {}) {
    this.side = side;
    this.speed = speed;
    this.width = 0;
    this.height = 0;
    this.x = 0;
    this.y = 0;
    this.active = false;
  }

  setScreen(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Entrar a la Mac a la misma altura relativa (0..1) a la que se salio de Windows. */
  enter(yFraction) {
    this.active = true;
    this.x = this.side === 'left' ? this.width - 1 : 0;
    this.y = clamp(yFraction, 0, 1) * (this.height - 1);
    return { x: Math.round(this.x), y: Math.round(this.y) };
  }

  /**
   * Aplica un movimiento relativo.
   * @returns {{x:number,y:number}|{leave:number}} nueva posicion, o la fraccion Y para volver
   */
  move(dx, dy) {
    const nx = this.x + dx * this.speed;
    const ny = clamp(this.y + dy * this.speed, 0, this.height - 1);
    const leaving = this.side === 'left' ? nx > this.width - 1 : nx < 0;
    if (leaving) {
      this.active = false;
      return { leave: this.height > 1 ? ny / (this.height - 1) : 0.5 };
    }
    this.x = clamp(nx, 0, this.width - 1);
    this.y = ny;
    return { x: Math.round(this.x), y: Math.round(this.y) };
  }

  /** En que borde de Windows esta la Mac. */
  windowsEdge() {
    return this.side;
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

module.exports = { RemoteCursor };
