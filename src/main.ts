// Entry point: boots Skyshard: Echoes of the Wild.
import './ui/styles.css';
import { Game } from './game/Game';
import { installAutomation } from './game/Automation';
import { heroPreview } from './debug/HeroPreview';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ui = document.getElementById('ui-root') as HTMLElement;
const params = new URLSearchParams(location.search);

if (params.get('preview') === 'heroes') {
  heroPreview(canvas, params.get('pose') || 'idle');
} else {
  // WebGL availability check with a friendly message
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    ui.innerHTML = `<div class="layer" style="display:flex;align-items:center;justify-content:center;text-align:center;font-family:Georgia,serif;font-size:20px;padding:40px">Skyshard needs WebGL 2, which this browser or device does not provide.<br>Please try a recent version of Chrome, Edge or Firefox.</div>`;
  } else {
    const game = new Game(canvas, ui);
    installAutomation(game);
    game.init().catch((e) => {
      console.error(e);
      ui.insertAdjacentHTML('beforeend', `<div class="layer" style="display:flex;align-items:center;justify-content:center;background:#0b0e24;color:#fff;font-family:Georgia,serif;z-index:100">Something went wrong while loading: ${String(e)}</div>`);
    });
  }
}
