
interface GamepadState {
  vector: { x: number; y: number };
  buttons: {
    a: boolean; // 0 - Cross/A
    b: boolean; // 1 - Circle/B
    x: boolean; // 2 - Square/X
    y: boolean; // 3 - Triangle/Y
    lb: boolean; // 4 - L1
    rb: boolean; // 5 - R1
    start: boolean; // 9 - Options/Start
    select: boolean; // 8 - Share/Select
  };
}

class GamepadManager {
  private deadzone = 0.15;
  private buttonCooldowns: Record<number, number> = {};
  private cooldownTime = 250; // ms tra input nei menu

  public getGamepad(): Gamepad | null {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    // Prende il primo gamepad attivo
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) return gamepads[i];
    }
    return null;
  }

  // Restituisce un vettore normalizzato (x, y) per il movimento
  public getMovementVector(): { x: number; y: number } {
    const gp = this.getGamepad();
    if (!gp) return { x: 0, y: 0 };

    let x = gp.axes[0]; // Left Stick X
    let y = gp.axes[1]; // Left Stick Y

    // Applica deadzone circolare
    const magnitude = Math.sqrt(x * x + y * y);
    if (magnitude < this.deadzone) {
      return { x: 0, y: 0 };
    }

    return { x, y };
  }

  // Verifica se un pulsante è premuto (raw)
  public isButtonDown(index: number): boolean {
    const gp = this.getGamepad();
    if (!gp || !gp.buttons[index]) return false;
    return gp.buttons[index].pressed;
  }

  // Verifica se un pulsante è premuto con cooldown (utile per i menu)
  public checkButtonPressWithCooldown(index: number): boolean {
    const now = Date.now();
    if (this.isButtonDown(index)) {
      if (!this.buttonCooldowns[index] || now - this.buttonCooldowns[index] > this.cooldownTime) {
        this.buttonCooldowns[index] = now;
        return true;
      }
    } else {
      // Resetta il cooldown se il tasto viene rilasciato
      this.buttonCooldowns[index] = 0;
    }
    return false;
  }

  // Verifica input stick come "click" digitale (utile per i menu: su/giù)
  public checkStickDirectionWithCooldown(axis: 'x' | 'y', direction: 1 | -1): boolean {
    const gp = this.getGamepad();
    if (!gp) return false;

    const val = gp.axes[axis === 'x' ? 0 : 1];
    const threshold = 0.5;
    
    // Asse Y: -1 è su, 1 è giù
    // Asse X: -1 è sinistra, 1 è destra
    const isDirection = direction === 1 ? val > threshold : val < -threshold;
    
    // Usiamo un indice fittizio alto per gestire il cooldown degli assi come se fossero bottoni
    const cooldownId = axis === 'x' ? 100 : 101; 
    const now = Date.now();

    if (isDirection) {
      if (!this.buttonCooldowns[cooldownId] || now - this.buttonCooldowns[cooldownId] > this.cooldownTime) {
        this.buttonCooldowns[cooldownId] = now;
        return true;
      }
    } else {
      // Resetta solo se l'asse è tornato neutrale
      if (Math.abs(val) < this.deadzone) {
         this.buttonCooldowns[cooldownId] = 0;
      }
    }
    return false;
  }
}

export const gamepadManager = new GamepadManager();
