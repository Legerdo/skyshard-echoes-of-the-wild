// Full-screen UI: loading, title, intro captions, defeat, victory stats, credits.
import { tr, t, type TStr } from '../core/i18n';
import { formatTime } from '../core/math';

const div = (cls: string, html = ''): HTMLElement => {
  const e = document.createElement('div');
  e.className = cls;
  e.innerHTML = html;
  return e;
};

export class Screens {
  root: HTMLElement;
  loading: HTMLElement;
  title: HTMLElement;
  intro: HTMLElement;
  defeat: HTMLElement;
  victory: HTMLElement;
  credits: HTMLElement;
  fade: HTMLElement;
  private titleMenu: HTMLElement;
  private pressStart: HTMLElement;
  onTitleAction: ((a: 'continue' | 'new' | 'settings' | 'lang') => void) | null = null;
  onDefeatAction: ((a: 'respawn' | 'title') => void) | null = null;
  onVictoryAction: ((a: 'explore' | 'title') => void) | null = null;
  titleReady = false;

  constructor(parent: HTMLElement) {
    this.root = parent;
    this.loading = div('layer', `<div class="ltitle">SKYSHARD</div><div class="lbar"><div class="lfill"></div></div><div class="lmsg"></div>`);
    this.loading.id = 'loading';
    this.title = div('layer hidden', `
      <div class="logo"><div class="l1">SKY<span class="star">✦</span>SHARD</div><div class="l2">Echoes of the Wild</div><div class="l3">${tr(t('AN OPEN-WORLD ACTION RPG', '오픈월드 액션 RPG'))}</div></div>
      <div class="press-start">${tr(t('Click or press any key', '클릭하거나 아무 키나 누르세요'))}</div>
      <div class="title-menu hidden"></div>
      <div class="title-foot">v1.0 · ${tr(t('All art, music and sound are generated in your browser.', '모든 그래픽, 음악, 효과음은 브라우저에서 실시간 생성됩니다.'))}</div>`);
    this.title.id = 'title';
    this.titleMenu = this.title.querySelector('.title-menu') as HTMLElement;
    this.pressStart = this.title.querySelector('.press-start') as HTMLElement;
    this.intro = div('layer hidden', `<div class="itext"></div><div class="skip">${tr(t('Press any key to skip', '아무 키나 눌러 건너뛰기'))}</div>`);
    this.intro.id = 'intro';
    this.defeat = div('layer hidden interactive', `<h1></h1><p></p><div style="display:flex;gap:12px"><button class="btn" data-a="respawn"></button><button class="btn" data-a="title"></button></div>`);
    this.defeat.id = 'defeat';
    this.victory = div('layer hidden interactive', `<div class="vbox panel"></div>`);
    this.victory.id = 'victory';
    this.credits = div('credits hidden', `<div class="ct"></div>`);
    this.fade = div('fade');
    parent.append(this.loading, this.title, this.intro, this.defeat, this.victory, this.credits, this.fade);
    this.defeat.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => this.onDefeatAction?.(b.dataset.a as 'respawn' | 'title')));
  }

  setLoading(frac: number, msg: string): void {
    (this.loading.querySelector('.lfill') as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
    (this.loading.querySelector('.lmsg') as HTMLElement).textContent = msg;
  }

  hideLoading(): void {
    this.loading.style.transition = 'opacity 0.8s';
    this.loading.style.opacity = '0';
    setTimeout(() => this.loading.classList.add('hidden'), 850);
  }

  showTitle(hasSave: boolean): void {
    this.title.classList.remove('hidden');
    this.relabelTitle(hasSave);
  }

  relabelTitle(hasSave: boolean): void {
    this.titleMenu.innerHTML = `
      ${hasSave ? `<button class="btn gold" data-a="continue">${tr(t('Continue', '이어하기'))}</button>` : ''}
      <button class="btn ${hasSave ? '' : 'gold'}" data-a="new">${tr(t('New Game', '새 게임'))}</button>
      <button class="btn" data-a="settings">${tr(t('Settings', '설정'))}</button>
      <button class="btn small" data-a="lang">${tr(t('한국어', 'English'))}</button>`;
    this.titleMenu.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => {
      b.onclick = () => this.onTitleAction?.(b.dataset.a as 'continue' | 'new' | 'settings' | 'lang');
      b.onmouseenter = () => this.onHover?.();
    });
    this.pressStart.textContent = tr(t('Click or press any key', '클릭하거나 아무 키나 누르세요'));
    (this.title.querySelector('.l3') as HTMLElement).textContent = tr(t('AN OPEN-WORLD ACTION RPG', '오픈월드 액션 RPG'));
    (this.title.querySelector('.title-foot') as HTMLElement).textContent = 'v1.0 · ' + tr(t('All art, music and sound are generated in your browser.', '모든 그래픽, 음악, 효과음은 브라우저에서 실시간 생성됩니다.'));
  }

  onHover: (() => void) | null = null;

  revealTitleMenu(): void {
    this.titleReady = true;
    this.pressStart.classList.add('hidden');
    this.titleMenu.classList.remove('hidden');
    this.titleMenu.classList.add('interactive');
  }

  hideTitle(): void {
    this.title.classList.add('hidden');
  }

  showIntroLine(text: string): void {
    this.intro.classList.remove('hidden');
    const e = this.intro.querySelector('.itext') as HTMLElement;
    e.classList.remove('show');
    setTimeout(() => {
      e.textContent = text;
      e.classList.add('show');
    }, 250);
  }

  hideIntro(): void {
    this.intro.classList.add('hidden');
    (this.intro.querySelector('.itext') as HTMLElement).classList.remove('show');
  }

  showDefeat(): void {
    (this.defeat.querySelector('h1') as HTMLElement).textContent = tr(t('The party has fallen', '파티가 쓰러졌다'));
    (this.defeat.querySelector('p') as HTMLElement).textContent = tr(t('"Every star falls. The brave ones rise again."', '"모든 별은 떨어진다. 용감한 별은 다시 떠오른다."'));
    (this.defeat.querySelector('[data-a=respawn]') as HTMLElement).textContent = tr(t('Rise again', '다시 일어서기'));
    (this.defeat.querySelector('[data-a=title]') as HTMLElement).textContent = tr(t('Return to title', '타이틀로'));
    this.defeat.classList.remove('hidden');
  }

  hideDefeat(): void {
    this.defeat.classList.add('hidden');
  }

  showCredit(text: string | null): void {
    const e = this.credits.querySelector('.ct') as HTMLElement;
    if (text === null) {
      e.classList.remove('show');
      setTimeout(() => this.credits.classList.add('hidden'), 1200);
      return;
    }
    this.credits.classList.remove('hidden');
    e.classList.remove('show');
    setTimeout(() => {
      e.textContent = text;
      e.classList.add('show');
    }, 350);
  }

  showVictory(stats: Array<[TStr, string | number]>): void {
    const box = this.victory.querySelector('.vbox') as HTMLElement;
    box.innerHTML = `<h1>${tr(t('Victory', '승리'))}</h1><div class="vsub">${tr(t('The fallen star is free', '떨어진 별이 자유를 되찾았다'))}</div>
      <div class="vstats">${stats.map(([l, v]) => `<div class="stat"><div class="sl">${tr(l)}</div><div class="sv">${v}</div></div>`).join('')}</div>
      <p style="font-family:var(--serif);font-style:italic;color:#e8e2ff;margin-bottom:20px">${tr(t('Thank you for playing Skyshard: Echoes of the Wild.', 'Skyshard: Echoes of the Wild를 플레이해 주셔서 감사합니다.'))}</p>
      <div class="vbtns"><button class="btn gold" data-a="explore">${tr(t('Keep exploring', '계속 탐험하기'))}</button><button class="btn" data-a="title">${tr(t('Return to title', '타이틀로'))}</button></div>`;
    box.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => this.onVictoryAction?.(b.dataset.a as 'explore' | 'title')));
    this.victory.classList.remove('hidden');
  }

  hideVictory(): void {
    this.victory.classList.add('hidden');
  }

  setFade(on: boolean, white = false): void {
    this.fade.classList.toggle('white', white);
    this.fade.classList.toggle('on', on);
  }
}

export function statTime(s: number): string {
  return formatTime(s);
}
