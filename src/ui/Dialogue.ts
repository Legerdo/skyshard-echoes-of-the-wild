// Dialogue box with typewriter text, speaker names and optional choices.
import { tr, tf } from '../core/i18n';
import { SPEAKERS, type Line } from '../quest/DialogueMain';

export interface Choice {
  label: string;
  fn: () => void;
}

export class Dialogue {
  root: HTMLElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;
  private nextEl: HTMLElement;
  private choicesEl: HTMLElement;
  open = false;
  private lines: Line[] = [];
  private idx = 0;
  private shown = 0;
  private full = '';
  private onDone: (() => void) | null = null;
  private choices: Choice[] | null = null;
  private vars: Record<string, string | number> = {};
  onLine: ((speaker: string) => void) | null = null;
  onBlip: (() => void) | null = null;
  private blipT = 0;
  autoAdvance = 0;
  private autoT = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dialog panel hidden interactive';
    this.root.innerHTML = `<div class="dname"></div><div class="dtext"></div><div class="dchoices"></div><div class="dnext"></div>`;
    parent.appendChild(this.root);
    this.nameEl = this.root.querySelector('.dname') as HTMLElement;
    this.textEl = this.root.querySelector('.dtext') as HTMLElement;
    this.nextEl = this.root.querySelector('.dnext') as HTMLElement;
    this.choicesEl = this.root.querySelector('.dchoices') as HTMLElement;
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      this.advance();
    });
  }

  start(lines: Line[], onDone?: () => void, choices?: Choice[], vars: Record<string, string | number> = {}): void {
    this.lines = lines;
    this.idx = 0;
    this.onDone = onDone ?? null;
    this.choices = choices ?? null;
    this.vars = vars;
    this.open = true;
    this.root.classList.remove('hidden');
    this.showLine();
  }

  private showLine(): void {
    const l = this.lines[this.idx];
    const sp = SPEAKERS[l.s] ?? SPEAKERS.system;
    const name = tr(sp.name);
    this.nameEl.innerHTML = name ? `<span style="color:${sp.color}">${name}</span>${sp.role ? `<span class="dsub">${tr(sp.role)}</span>` : ''}` : '';
    this.full = tf(l.t, this.vars);
    this.shown = 0;
    this.textEl.textContent = '';
    this.textEl.style.color = l.s === 'system' ? '#f3d38a' : '';
    this.textEl.style.fontStyle = l.s === 'system' || l.s === 'echo' || l.s === 'tree' ? 'italic' : '';
    this.choicesEl.innerHTML = '';
    this.nextEl.textContent = '';
    this.autoT = 0;
    this.onLine?.(l.s);
  }

  private get lastLine(): boolean {
    return this.idx >= this.lines.length - 1;
  }

  private renderChoices(): void {
    if (!this.choices || !this.lastLine) return;
    this.choicesEl.innerHTML = '';
    this.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = `${i + 1}. ${c.label}`;
      b.onclick = () => this.choose(i);
      this.choicesEl.appendChild(b);
    });
  }

  choose(i: number): void {
    if (!this.choices || !this.lastLine || this.shown < this.full.length) return;
    const c = this.choices[i];
    if (!c) return;
    this.close();
    c.fn();
  }

  get hasChoices(): boolean {
    return !!this.choices && this.lastLine && this.shown >= this.full.length;
  }

  advance(): void {
    if (!this.open) return;
    if (this.shown < this.full.length) {
      this.shown = this.full.length;
      this.textEl.textContent = this.full;
      this.renderChoices();
      return;
    }
    if (this.hasChoices) return;
    if (this.lastLine) {
      const cb = this.onDone;
      this.close();
      cb?.();
      return;
    }
    this.idx++;
    this.showLine();
  }

  close(): void {
    this.open = false;
    this.root.classList.add('hidden');
    this.choices = null;
  }

  update(dt: number): void {
    if (!this.open) return;
    if (this.shown < this.full.length) {
      this.shown = Math.min(this.full.length, this.shown + dt * 55);
      this.textEl.textContent = this.full.slice(0, Math.floor(this.shown));
      this.blipT -= dt;
      if (this.blipT <= 0) {
        this.blipT = 0.07;
        this.onBlip?.();
      }
      if (this.shown >= this.full.length) this.renderChoices();
    } else {
      this.nextEl.textContent = this.hasChoices ? '' : this.lastLine ? '✦' : '▼';
      if (this.autoAdvance > 0 && !this.hasChoices) {
        this.autoT += dt;
        if (this.autoT > this.autoAdvance + this.full.length * 0.02) this.advance();
      }
    }
  }
}
