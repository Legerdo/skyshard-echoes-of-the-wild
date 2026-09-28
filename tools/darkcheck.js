// Diagnostics: detect frames where the 3D view renders (almost) uniformly dark. After each render a coarse
// grid of pixels is read back; on a dark frame the scene is re-rendered without post-processing to tell a
// scene problem (camera/geometry) from an HDR/bloom problem (NaN/Inf spreading through the blur chain).
(() => {
  const S = window.__sky;
  const G = S.game;
  const pipe = G.pipe;
  const gl = pipe.renderer.getContext();
  const B = window.__bot;
  B.dark = B.dark || [];
  const buf = new Uint8Array(4);
  const sample = () => {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    let sum = 0;
    let max = 0;
    let n = 0;
    for (let i = 1; i < 6; i++) {
      for (let j = 1; j < 5; j++) {
        gl.readPixels(Math.floor((w * i) / 6), Math.floor((h * j) / 5), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const l = (buf[0] + buf[1] + buf[2]) / 3;
        sum += l;
        max = Math.max(max, l);
        n++;
      }
    }
    return { avg: sum / n, max };
  };
  let frame = 0;
  const orig = pipe.render.bind(pipe);
  pipe.render = () => {
    orig();
    frame++;
    if (G.state !== 'play' || frame % 3) return;
    const s = sample();
    if (s.max > 40) return;
    // dark frame: diagnose
    const c = G.camera;
    const e = c.matrixWorld.elements;
    const camNaN = e.some((v) => !isFinite(v)) || !isFinite(c.fov) || !isFinite(c.near);
    let raw = null;
    try {
      pipe.renderer.render(pipe.scene, c);
      raw = sample();
    } catch (err) {
      raw = String(err);
    }
    const p = G.player.pos;
    const rec = {
      t: +G.realTime.toFixed(2), step: G.story.stepId, avg: +s.avg.toFixed(1), max: s.max, rawNoPost: raw, camNaN,
      cam: [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(1)), fov: c.fov, player: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), pstate: G.player.state,
      preset: G.world.sky.current, fields: G.combat.fields.length, particles: G.fx?.count ?? null,
    };
    if (B.dark.length < 40) B.dark.push(rec);
    if (B.dark.length <= 3) console.log('[dark] ' + JSON.stringify(rec));
    if ((B.darkCulprits || (B.darkCulprits = [])).length < 3 && !B.darkBusy) {
      B.darkBusy = true;
      // find the object responsible: hide children one at a time, descend into the one whose hiding fixes the frame
      const darkNow = () => {
        pipe.composer.render();
        return sample().max <= 40;
      };
      const describe = (o) => {
        const m = o.material;
        const mats = Array.isArray(m) ? m : m ? [m] : [];
        return {
          type: o.type, name: o.name, uuid: o.uuid.slice(0, 8),
          mat: mats.map((x) => `${x.type}${x.name ? ':' + x.name : ''}${x.uniforms ? '{' + Object.keys(x.uniforms).join(',') + '}' : ''} blend=${x.blending} opacity=${x.opacity}`),
          scale: [o.scale.x, o.scale.y, o.scale.z].map((v) => +v.toFixed(3)), pos: [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(1)),
          count: o.count ?? null, geo: o.geometry ? Object.keys(o.geometry.attributes).join(',') + ' n=' + (o.geometry.attributes.position?.count ?? 0) : null,
          user: Object.keys(o.userData || {}).join(','),
          enemy: (() => {
            const en = G.enemies.list.find((q) => { let x = o; while (x) { if (x === q.model.root) return true; x = x.parent; } return false; });
            if (!en) return null;
            const cp = G.camera.position;
            return `${en.def.id} pos=(${en.pos.x.toFixed(1)},${en.pos.y.toFixed(1)},${en.pos.z.toFixed(1)}) r=${en.radius} h=${en.height} camD=${Math.hypot(cp.x - en.pos.x, cp.z - en.pos.z).toFixed(2)} camDy=${(cp.y - en.pos.y).toFixed(2)} rootVis=${en.model.root.visible}`;
          })(),
          visible: o.visible,
          chain: (() => { const a = []; let q = o.parent; while (q && a.length < 6) { a.push(q.name || q.type); q = q.parent; } return a.join('<'); })(),
        };
      };
      const find = (node, depth) => {
        const kids = node.children.filter((k) => k.visible);
        for (const k of kids) {
          k.visible = false;
          const d = darkNow();
          k.visible = true;
          if (!d) return depth < 12 && k.children.length ? find(k, depth + 1) || describe(k) : describe(k);
        }
        return null;
      };
      let culprit = null;
      try {
        culprit = darkNow() ? find(pipe.scene, 0) || 'not isolated (several sources?)' : 'frame no longer dark';
      } catch (err) {
        culprit = 'search failed: ' + err;
      }
      B.darkCulprits.push(culprit);
      console.log('[dark] CULPRIT ' + JSON.stringify(culprit));
      // don't search again for the same episode
      setTimeout(() => (B.darkBusy = false), 1500);
    }
  };
  console.log('[dark] darkcheck installed');
})();
