// Unified input: keyboard + mouse (pointer lock) + gamepad + virtual (automation).

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'attack'
  | 'skill'
  | 'burst'
  | 'interact'
  | 'drop'
  | 'lockon'
  | 'map'
  | 'quests'
  | 'inventory'
  | 'pause'
  | 'heal'
  | 'char1'
  | 'char2'
  | 'char3'
  | 'char4'
  | 'walk';

export const ACTIONS: Action[] = [
  'forward', 'back', 'left', 'right', 'jump', 'sprint', 'attack', 'skill', 'burst', 'interact', 'drop',
  'lockon', 'heal', 'char1', 'char2', 'char3', 'char4', 'walk', 'map', 'quests', 'inventory', 'pause',
];

export type Bindings = Record<Action, string[]>;

export function defaultBindings(): Bindings {
  return {
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    sprint: ['ShiftLeft', 'Mouse2'],
    attack: ['Mouse0', 'KeyK'],
    skill: ['KeyE'],
    burst: ['KeyQ'],
    interact: ['KeyF'],
    drop: ['KeyX'],
    lockon: ['KeyT', 'Mouse1'],
    heal: ['KeyZ'],
    char1: ['Digit1'],
    char2: ['Digit2'],
    char3: ['Digit3'],
    char4: ['Digit4'],
    walk: ['ControlLeft'],
    map: ['KeyM'],
    quests: ['KeyJ'],
    inventory: ['KeyI', 'KeyC'],
    pause: ['Escape', 'KeyP'],
  };
}

const PAD_MAP: Partial<Record<number, Action>> = {
  0: 'jump',
  1: 'sprint',
  2: 'attack',
  3: 'interact',
  4: 'drop',
  5: 'skill',
  6: 'heal',
  7: 'burst',
  8: 'map',
  9: 'pause',
  11: 'lockon',
  12: 'char1',
  15: 'char2',
  13: 'char3',
  14: 'char4',
};

export function codeLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'Alt',
    Escape: 'Esc',
    Tab: 'Tab',
    Enter: 'Enter',
    Mouse0: 'LMB',
    Mouse1: 'MMB',
    Mouse2: 'RMB',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backquote: '`',
  };
  return map[code] ?? code;
}

export class Input {
  bindings: Bindings = defaultBindings();
  private held = new Set<string>();
  private pressedCodes = new Set<string>();
  private releasedCodes = new Set<string>();
  private padHeld = new Set<Action>();
  private padPressed = new Set<Action>();
  private prevPadButtons: boolean[] = [];
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  padMove = { x: 0, y: 0 };
  padLook = { x: 0, y: 0 };
  usingGamepad = false;
  pointerLocked = false;
  /** When > 0 we are in a later physics sub-step; one-shot presses are suppressed. */
  substep = 0;
  /** Virtual input used by automated tests (behaves like a real player's controller). */
  virtual = {
    enabled: false,
    held: new Set<Action>(),
    pressed: new Set<Action>(),
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
  };
  onPointerLockLost: (() => void) | null = null;
  onAnyKey: ((code: string) => void) | null = null;
  /** When set, the next key press is captured for rebinding. */
  captureNext: ((code: string) => void) | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (this.captureNext) {
        e.preventDefault();
        const fn = this.captureNext;
        this.captureNext = null;
        fn(e.code);
        return;
      }
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        const tgt = e.target as HTMLElement | null;
        if (!tgt || (tgt.tagName !== 'INPUT' && tgt.tagName !== 'SELECT')) e.preventDefault();
      }
      if (!e.repeat) {
        this.pressedCodes.add(e.code);
        this.onAnyKey?.(e.code);
      }
      this.held.add(e.code);
      this.usingGamepad = false;
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.releasedCodes.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (this.captureNext) {
        const fn = this.captureNext;
        this.captureNext = null;
        fn(code);
        return;
      }
      this.held.add(code);
      this.pressedCodes.add(code);
      this.usingGamepad = false;
    });
    window.addEventListener('mouseup', (e) => {
      const code = 'Mouse' + e.button;
      this.held.delete(code);
      this.releasedCodes.add(code);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || (e.buttons & 4) !== 0) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (was && !this.pointerLocked) this.onPointerLockLost?.();
    });
  }

  requestPointerLock(): void {
    if (this.virtual.enabled) return;
    if (document.pointerLockElement !== this.canvas) {
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once per rendered frame before game updates. */
  poll(): void {
    this.padPressed.clear();
    this.padHeld.clear();
    this.padMove.x = this.padMove.y = 0;
    this.padLook.x = this.padLook.y = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const lx = dead(pad.axes[0] ?? 0);
      const ly = dead(pad.axes[1] ?? 0);
      const rx = dead(pad.axes[2] ?? 0);
      const ry = dead(pad.axes[3] ?? 0);
      this.padMove.x = lx;
      this.padMove.y = -ly;
      this.padLook.x = rx;
      this.padLook.y = ry;
      pad.buttons.forEach((b, i) => {
        const act = PAD_MAP[i];
        const down = b.pressed || b.value > 0.5;
        if (down) this.usingGamepad = true;
        if (!act) return;
        if (down) this.padHeld.add(act);
        if (down && !this.prevPadButtons[i]) this.padPressed.add(act);
        this.prevPadButtons[i] = down;
      });
      if (Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.1) this.usingGamepad = true;
      break;
    }
  }

  held_(a: Action): boolean {
    if (this.virtual.enabled && this.virtual.held.has(a)) return true;
    if (this.padHeld.has(a)) return true;
    const codes = this.bindings[a];
    if (!codes) return false;
    for (const c of codes) if (this.held.has(c)) return true;
    return false;
  }

  /** Is action currently held. */
  down(a: Action): boolean {
    return this.held_(a);
  }

  /** Was the action pressed this frame (only true on the first sub-step). */
  pressed(a: Action): boolean {
    if (this.substep > 0) return false;
    if (this.virtual.enabled && this.virtual.pressed.has(a)) return true;
    if (this.padPressed.has(a)) return true;
    const codes = this.bindings[a];
    if (!codes) return false;
    for (const c of codes) if (this.pressedCodes.has(c)) return true;
    return false;
  }

  released(a: Action): boolean {
    if (this.substep > 0) return false;
    const codes = this.bindings[a];
    if (!codes) return false;
    for (const c of codes) if (this.releasedCodes.has(c)) return true;
    return false;
  }

  /** Movement vector: x = right, y = forward. Length <= 1. */
  move(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    if (this.down('right')) x += 1;
    if (this.down('left')) x -= 1;
    x += this.padMove.x;
    y += this.padMove.y;
    if (this.virtual.enabled) {
      x += this.virtual.move.x;
      y += this.virtual.move.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  anyKeyPressed(): boolean {
    return this.pressedCodes.size > 0 || this.padPressed.size > 0;
  }

  /** Clear per-frame state; call at the end of each rendered frame. */
  endFrame(): void {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.substep = 0;
    this.virtual.pressed.clear();
    this.virtual.look.x = 0;
    this.virtual.look.y = 0;
  }

  bindingLabel(a: Action): string {
    const c = this.bindings[a]?.[0];
    return codeLabel(c ?? '');
  }
}
