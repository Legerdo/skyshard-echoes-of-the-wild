// In-page playtest bot. Drives the game ONLY through virtual controller input (stick, buttons, camera)
// and normal UI actions (dialog advance, map fast-travel click, defeat "Rise again"). No teleports, no cheats.
(() => {
  const S = window.__sky;
  const G = S.game;
  const V = G.input.virtual;
  S.enableVirtual(true);
  const B = (window.__bot = window.__bot || { log: [], events: {}, shots: [], done: false, error: null, stopAt: null, route: [] });
  let dt = 1 / 60;
  B.setDt = (v) => (dt = Math.min(0.05, v));
  const HEROES = ['rowan', 'mirelle', 'wren', 'idris'];
  const P = () => G.player;
  const pos = () => G.player.pos;
  const log = (m) => {
    const line = `[${G.realTime.toFixed(1)}s ${G.story.stepId}] ${m}`;
    B.log.push(line);
    console.log('[bot] ' + line);
  };
  const ev = (k) => {
    if (!B.events[k]) {
      B.events[k] = G.realTime;
      log('EVENT ' + k);
    }
  };
  const shot = (name) => B.shots.push(name);
  const dxz = (x, z) => Math.hypot(x - pos().x, z - pos().z);
  const press = (a) => V.pressed.add(a);
  const hold = (a, on) => (on ? V.held.add(a) : V.held.delete(a));
  const clearIn = () => {
    V.move.x = V.move.y = 0;
    V.held.clear();
  };
  function stickTo(dx, dz, mag = 1) {
    const yaw = G.cam.yaw;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    V.move.y = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * mag;
    V.move.x = (-dx * Math.cos(yaw) + dz * Math.sin(yaw)) * mag;
  }
  const active = () => G.party.activeMember.id;
  const unlocked = (id) => G.party.unlocked.has(id);
  const hpFrac = () => G.party.activeMember.hp / G.party.maxHp(G.party.activeMember);

  // ---------------- primitives ----------------
  function* wait(sec) {
    let t = 0;
    while (t < sec) {
      t += dt;
      yield;
    }
  }
  function* waitUntil(fn, timeout = 60, what = 'condition') {
    let t = 0;
    while (!fn()) {
      t += dt;
      if (t > timeout) throw new Error('timeout waiting for ' + what);
      if (G.state === 'dialog' || G.state === 'cine') yield* dialogs();
      else yield;
    }
  }
  function* dialogs() {
    let t = 0;
    while (G.state === 'dialog' || G.state === 'cine' || G.state === 'intro') {
      clearIn();
      t += dt;
      if (G.state === 'dialog' && t > 0.3) {
        t = 0;
        press('interact');
      }
      yield;
    }
  }
  function* switchTo(id) {
    if (!unlocked(id)) return;
    const i = HEROES.indexOf(id);
    let t = 0;
    while (active() !== id && t < 4) {
      if (G.party.canSwitch(i) && G.party.members[i].alive) press('char' + (i + 1));
      t += dt;
      yield;
    }
    if (active() === id) ev('switch_' + id);
  }
  function* handleDefeat() {
    log('party defeated -> Rise again');
    ev('defeat');
    clearIn();
    yield* waitUntil(() => !G.screens.defeat.classList.contains('hidden'), 10, 'defeat screen');
    shot('defeat');
    yield* wait(1);
    S.respawn();
    yield* waitUntil(() => G.state === 'play', 10, 'respawn');
    yield* wait(1);
    throw new Error('RESTART');
  }

  // ---------------- threat assessment ----------------
  function foes(r = 30) {
    const p = pos();
    return G.enemies.list.filter((e) => e.alive && e.distTo(p) < r && Math.abs(e.pos.y - p.y) < 12);
  }
  function engaged(r = 16) {
    return foes(r).filter((e) => e.state === 'chase' || e.state === 'attack' || e.state === 'alert' || e.state === 'stagger');
  }
  /** Rotate a desired direction until it doesn't lead off a ledge. */
  function safeDir(dx, dz, dist = 4) {
    const p = pos();
    const l = Math.hypot(dx, dz) || 1;
    const base = Math.atan2(dx / l, dz / l);
    const g0 = G.world.cw.ground(p.x, p.z, p.y + 0.5).h;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI]) {
      const a = base + off;
      const x = p.x + Math.sin(a) * dist;
      const z = p.z + Math.cos(a) * dist;
      const g = G.world.cw.ground(x, z, p.y + 1.5).h;
      const w = G.world.waterAt(x, z);
      if (g > g0 - 2.5 && !(w && w.kind === 'lava')) return { x: Math.sin(a), z: Math.cos(a) };
    }
    return null;
  }
  function dangerDir() {
    // returns a world direction to dodge toward, or null
    const d0 = dangerRaw();
    return d0 ? safeDir(d0.x, d0.z) : null;
  }
  function dangerRaw() {
    const p = pos();
    for (const e of foes(24)) {
      if (e.state !== 'attack' || e.phase !== 'wind' || !e.cur) continue;
      const left = e.cur.windup - e.phaseT;
      if (left > 0.42) continue;
      const d = e.distTo(p);
      const reach = (e.cur.range ?? 3) + e.radius + 2.5;
      const ranged = ['fireball', 'gustBlade', 'orbs', 'spore', 'bladeFan', 'geyser'].includes(e.cur.name);
      if (!ranged && d > reach) continue;
      if (ranged && e.cur.name !== 'geyser') continue; // projectiles: handled by strafing
      // dodge sideways/away
      const ax = p.x - e.pos.x;
      const az = p.z - e.pos.z;
      const side = (e.uid % 2 ? 1 : -1);
      return { x: ax * 0.6 + -az * side, z: az * 0.6 + ax * side };
    }
    for (const f of G.combat.fields) {
      if (f.team !== 'enemy' || f.r <= 0) continue;
      if (f.tag === 'nova' || f.tag === 'lavaPool' || f.tag === 'dash' || f.tag === 'timer') continue;
      const left = f.dur - f.t;
      if (left > 0.7) continue;
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      if (d < f.r + 0.8) return { x: p.x - f.x + 0.01, z: p.z - f.z };
    }
    return null;
  }

  function pickHero(e) {
    const has = (id) => unlocked(id) && G.party.member(id).alive;
    if (e && e.def.flying && e.pos.y - pos().y > 2.6 && !e.isBoss && has('mirelle') && !(e.elemShield && e.elemShield.hp > 0)) return 'mirelle';
    if (e && e.elemShield && e.elemShield.hp > 0) {
      const m = { 1: 'rowan', 2: 'mirelle', 3: 'wren', 4: 'idris' }[e.elemShield.elem];
      if (m && has(m)) return m;
    }
    if (e && e.def.guard && has('idris')) return 'idris';
    return null;
  }

  // ---------------- combat ----------------
  let rot = { t: 0, i: 0 };
  function* fight(opts = {}) {
    const R = opts.r ?? 26;
    let atkT = 0;
    let t = 0;
    let chargeT = 0;
    let sideT = 0;
    let sideSign = 1;
    let stallT = 0;
    let lastHp = Infinity;
    let lastN = -1;
    log('fight start (' + foes(R).length + ' foes)');
    ev('combat');
    while (true) {
      if (G.state === 'defeat') yield* handleDefeat();
      if (G.state === 'dialog' || G.state === 'cine') {
        yield* dialogs();
        continue;
      }
      if (G.state !== 'play') {
        yield;
        continue;
      }
      const list = foes(R).filter((e) => opts.all || e.state !== 'idle' || e.distTo(pos()) < 12 || e.isBoss);
      if (opts.until && opts.until()) break;
      if (!list.length) {
        if (opts.until) {
          yield;
          continue;
        }
        break;
      }
      t += dt;
      if (t > (opts.timeout ?? 300)) throw new Error('fight timeout');
      // stall detection: no foe in range has lost HP for a while (e.g. a foe up on a ledge we can't path to)
      const hpSum = list.reduce((s, q) => s + q.hp, 0);
      if (hpSum < lastHp - 0.5 || list.length !== lastN || list.some((q) => q.isBoss || q.immune)) stallT = 0;
      else stallT += dt;
      lastHp = hpSum;
      lastN = list.length;
      if (stallT > 12) {
        stallT = 0;
        const q = list.slice().sort((a, b) => a.distTo(pos()) - b.distTo(pos()))[0];
        log(`fight stalled vs ${q.def.id} (dy=${(q.pos.y - pos().y).toFixed(1)}), approaching it directly`);
        try {
          yield* goto(q.pos.x, q.pos.z, 2.5, { y: q.def.flying ? undefined : q.pos.y, yTol: 2.5, noFight: true, climb: q.pos.y > pos().y + 2, timeout: 25 });
        } catch (err) {
          if (String(err.message) === 'RESTART') throw err;
        }
        continue;
      }
      // walked into a pillar/wall while chasing: keep climbing toward a foe standing above, else let go and sidestep
      if (P().state === 'climb') {
        const q = list.slice().sort((a, b) => a.distTo(pos()) - b.distTo(pos()))[0];
        if (!q.def.flying && q.pos.y > pos().y + 1.5 && P().climb.kind === 'terrain' && P().stamina > 15) {
          V.move.x = 0;
          V.move.y = 1;
          yield;
          continue;
        }
        press('drop');
        sideT = 0.6;
        sideSign = -sideSign;
        yield;
        continue;
      }
      sideT -= dt;
      const p = pos();
      list.sort((a, b) => a.distTo(p) - b.distTo(p));
      const e = opts.pick ? opts.pick(list) : list[0];
      // special boss mechanics
      if (opts.special && (yield* opts.special(e))) continue;
      // dodge
      const dd = dangerDir();
      if (dd && P().grounded) {
        stickTo(dd.x, dd.z, 1);
        press('sprint');
        ev('dodge');
        yield;
        yield;
        continue;
      }
      // heal
      if (hpFrac() < 0.4 && (G.save.inv.items.tart ?? 0) > 0) press('heal');
      // hero choice: shields/guards first, else reaction rotation
      const want = pickHero(e);
      rot.t += dt;
      if (want && active() !== want) {
        yield* switchTo(want);
        continue;
      }
      if (!want && rot.t > (active() === 'rowan' ? 2.6 : 1.8)) {
        rot.t = 0;
        const order = HEROES.filter((h) => unlocked(h) && G.party.member(h).alive);
        const resist = e.def.resist || [];
        const elemOf = { rowan: 1, mirelle: 2, wren: 3, idris: 4 };
        const cyc = order.filter((h) => !resist.includes(elemOf[h]));
        const pool = cyc.length ? cyc : order;
        // Rowan <-> Mirelle for Steamburst when possible, sometimes the others
        rot.i = (rot.i + 1) % Math.max(1, pool.length + (pool.includes('rowan') ? 1 : 0));
        const nextId = rot.i >= pool.length ? 'rowan' : pool[rot.i];
        if (nextId !== active()) yield* switchTo(nextId);
      }
      const id = active();
      const m = G.party.activeMember;
      const ranged = id === 'mirelle';
      const d = e.distTo(p);
      const reach = ranged ? 11 : 1.7 + e.radius;
      const vy = e.pos.y - p.y;
      if (d > reach || (e.def.flying && vy > 2.4 && !ranged && d > 1.2)) {
        let ax = e.pos.x - p.x;
        let az = e.pos.z - p.z;
        if (sideT > 0) {
          // sidestep around the obstacle we just let go of
          const tx = -az * sideSign;
          az = ax * sideSign;
          ax = tx;
        }
        const sd = safeDir(ax, az, 3) || { x: 0, z: 0 };
        stickTo(sd.x, sd.z, sd.x || sd.z ? 1 : 0);
        hold('sprint', d > 9);
        hold('attack', false);
        chargeT = 0;
        if (e.def.flying && vy > 2.5 && d < 3.5 && P().grounded) press('jump');
      } else {
        hold('sprint', false);
        stickTo(e.pos.x - p.x, e.pos.z - p.z, 0.25);
        const guarded = e.def.guard && id === 'rowan';
        if (guarded) {
          // heavy charged strikes break guards
          chargeT += dt;
          if (chargeT < 0.6) hold('attack', true);
          else {
            hold('attack', false);
            if (chargeT > 1.3) chargeT = 0;
          }
          if (chargeT < dt * 1.5) press('attack');
        } else {
          hold('attack', false);
          atkT -= dt;
          if (atkT <= 0) {
            press('attack');
            atkT = 0.14;
          }
        }
        if (m.skillCd <= 0 && d < 8) {
          press('skill');
          ev('skill_' + id);
        }
        if (m.energy >= m.def.burstCost && d < 7) {
          press('burst');
          ev('burst_' + id);
        }
      }
      if (G.combat.stats.reactions > 0) ev('reaction');
      yield;
    }
    clearIn();
    log('fight end');
  }

  // ---------------- movement ----------------
  function* goto(x, z, r = 2.2, o = {}) {
    let stuckT = 0;
    let bestD = Infinity;
    let jumps = 0;
    let t = 0;
    let detour = 0;
    let resting = false;
    while (true) {
      if (G.state === 'defeat') yield* handleDefeat();
      if (G.state === 'dialog' || G.state === 'cine') {
        yield* dialogs();
        continue;
      }
      if (G.state === 'menu') {
        yield;
        continue;
      }
      const p = pos();
      const d = dxz(x, z);
      if (d < r && (o.y === undefined || Math.abs(p.y - o.y) < (o.yTol ?? 3))) break;
      t += dt;
      if (t > (o.timeout ?? 150)) throw new Error(`goto timeout (${x.toFixed(0)},${z.toFixed(0)}) at (${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)})`);
      if (!o.noFight && engaged(o.fightR ?? 12).length && P().grounded) {
        yield* fight({ r: 22 });
        continue;
      }
      const st = P().state;
      // before a long climb, rest on solid ground until stamina is (nearly) full
      if (o.climb && st === 'ground') {
        if (P().stamina < P().maxStamina * 0.6) resting = true;
        if (resting) {
          if (P().stamina >= P().maxStamina * 0.97) resting = false;
          clearIn();
          yield;
          continue;
        }
      }
      if (st === 'climb') {
        ev('climb');
        V.move.x = 0;
        V.move.y = 1;
        hold('sprint', false);
        // climbing something irrelevant (tree trunk, house) that won't get us closer: let go and go around.
        // Terrain cliffs are climbed when the destination lies above us.
        // (keep climbing until over the lip: the target height is the top surface, not the hands)
        const terrainWall = P().climb.kind === 'terrain';
        const wantUp = o.y !== undefined ? o.y > p.y - 2 : terrainWall && G.world.hf.height(x, z) > p.y - 2;
        if (o.noClimb || !wantUp) {
          press('drop');
          detour = 1.4;
          jumps++;
        }
        yield;
        continue;
      }
      if (st === 'glide') ev('glide');
      // falling from height -> glide to avoid damage
      if (st === 'air' && P().vel.y < -6 && P().heightAboveGround() > 7 && P().gliderUnlocked && P().stamina > 10) press('jump');
      if (detour > 0) {
        detour -= dt;
        const yaw = Math.atan2(x - p.x, z - p.z) + (jumps % 2 ? 1.4 : -1.4);
        stickTo(Math.sin(yaw), Math.cos(yaw), 1);
      } else stickTo(x - p.x, z - p.z, 1);
      hold('sprint', d > 14 && P().stamina > 35 && !o.walk && st === 'ground');
      // stuck handling
      if (d < bestD - 0.4) {
        bestD = d;
        stuckT = 0;
      } else if (st === 'ground') stuckT += dt;
      if (stuckT > 1.1) {
        stuckT = 0;
        jumps++;
        press('jump');
        if (jumps % 3 === 0) detour = 1.2;
        bestD = d;
      }
      yield;
    }
    clearIn();
  }

  function* path(pts, r = 3, o = {}) {
    for (const pt of pts) yield* goto(pt[0], pt[1], pt[2] ?? r, o);
  }

  function* talk(npcId) {
    const n = G.content.npcs.get(npcId);
    yield* goto(n.pos.x, n.pos.z, 2.0, { y: n.pos.y, yTol: 2.4 });
    let tries = 0;
    while (G.state !== 'dialog' && tries < 40) {
      const n2 = G.content.npcs.get(npcId);
      if (dxz(n2.pos.x, n2.pos.z) > 2.4) yield* goto(n2.pos.x, n2.pos.z, 1.8);
      press('interact');
      tries++;
      yield;
      yield;
    }
    log('talk ' + npcId);
    yield* dialogs();
  }

  function* interactId(id, getPos) {
    const q = getPos();
    yield* goto(q.x, q.z, 1.6, { y: q.y, yTol: 2.5 });
    let tries = 0;
    while (tries < 60) {
      const it = G.story.interactables().find((i) => i.id === id);
      if (!it) break;
      press('interact');
      tries++;
      yield;
      yield;
      if (G.state !== 'play') break;
    }
    yield* dialogs();
  }

  function* waitStamina(frac = 0.98) {
    clearIn();
    let t = 0;
    while (P().stamina < P().maxStamina * frac && t < 12) {
      t += dt;
      yield;
    }
  }

  /** Jump into an updraft, glide up to its top, then glide to (tx,tz) and land near height ty. */
  function* ride(uid, tx, tz, ty, o = {}) {
    yield* rideChain([uid], tx, tz, ty, o);
  }

  /**
   * Chain several updrafts without landing: ride the first column up, glide into the next one, ... then
   * glide from the last column's top to (tx,tz) and land near height ty.
   */
  function* rideChain(ids, tx, tz, ty, o = {}) {
    yield* waitStamina();
    if (unlocked('wren')) yield* switchTo('wren');
    const first = window.__updrafts[ids[0]];
    log(`ride ${ids.join(' > ')} (top ${window.__updrafts[ids[ids.length - 1]].top}) -> (${tx.toFixed(0)},${tz.toFixed(0)},${ty})`);
    // step into the first column
    yield* goto(first.x, first.z, Math.max(0.8, first.r * 0.45), { noFight: true, timeout: 40 });
    press('jump');
    yield* wait(0.25);
    for (let i = 0; i < ids.length; i++) {
      const u = window.__updrafts[ids[i]];
      const topWant = u.top - (i === ids.length - 1 ? o.below ?? 2.5 : 2.5);
      let t = 0;
      let reopenT = 0;
      while (pos().y < topWant) {
        t += dt;
        reopenT += dt;
        if (t > 25) throw new Error(`updraft ascent timeout (${ids[i]}) at y=${pos().y.toFixed(1)}`);
        const st = P().state;
        if (st === 'air' && P().heightAboveGround() > 2.6 && reopenT > 0.25) {
          press('jump');
          reopenT = 0;
        }
        if (st === 'ground') {
          if (i > 0) throw new Error(`fell short of the ${ids[i]} column`);
          press('jump');
          yield* wait(0.2);
        }
        if (st === 'climb') press('drop');
        const p = pos();
        const off = Math.hypot(p.x - u.x, p.z - u.z);
        if (off > 0.4) stickTo(u.x - p.x, u.z - p.z, Math.min(1, off / 2));
        else clearIn();
        if (st === 'glide') {
          ev('glide');
          ev('updraft');
        }
        yield;
      }
    }
    yield* glideTo(tx, tz, ty, o);
  }

  function* glideTo(tx, tz, ty, o = {}) {
    let t = 0;
    let freeT = 9; // time since we deliberately folded the wing (hysteresis against fold/unfold flicker)
    let toggleT = 9;
    while (true) {
      t += dt;
      if (t > 40) throw new Error('glideTo timeout');
      const p = pos();
      const st = P().state;
      const d = dxz(tx, tz);
      if (st === 'ground' || st === 'climb' || st === 'mantle') {
        if (st === 'climb') {
          // glided into a wall: let go and drop onto the ledge below
          press('drop');
          clearIn();
          yield;
          continue;
        }
        if (st === 'mantle') {
          yield;
          continue;
        }
        break;
      }
      const high = p.y - ty;
      const inLift = !!G.world.updraftAt(p.x, p.y, p.z);
      toggleT += dt;
      const toggle = () => {
        // never flip the wing faster than a few times per second
        if (toggleT < 0.2) return false;
        toggleT = 0;
        press('jump');
        return true;
      };
      if (st === 'air') {
        freeT += dt;
        // re-open the wing: normally when falling toward a far target, or to brake a steep drop
        const brake = P().vel.y < -14 || high < 9;
        const reopen = brake || (d > 6 && freeT > 0.6);
        if (P().vel.y < -2 && high > 1.2 && (d > 2.5 || (high > 6 && brake)) && P().stamina > 3 && reopen) toggle();
      }
      if (st === 'glide') {
        if (d < 2.2 && high > 2.5 && high < 13) {
          if (toggle()) freeT = 0; // drop onto the target
        } else if (d < 6 && high > 9 && !inLift && P().vel.y > -8) {
          // too high above it: short free-fall hops instead of circling (circling drifts in wind and costs stamina)
          if (toggle()) freeT = 0;
        }
      }
      if (d > 0.6) {
        // over the target but still lifted by an updraft: slide out of the column first
        if (inLift && high > 6 && d < 8) stickTo(tx - p.x + (p.x - tx) * 3, tz - p.z + (p.z - tz) * 3, 1);
        else stickTo(tx - p.x, tz - p.z, d < 3 ? 0.45 : 1);
      } else clearIn();
      yield;
    }
    clearIn();
    log(`landed at (${pos().x.toFixed(1)},${pos().y.toFixed(1)},${pos().z.toFixed(1)}) target d=${dxz(tx, tz).toFixed(1)}`);
  }

  /** Strike an element-reactive object with a given hero until it activates. */
  function* hitObject(obj, hero, o = {}) {
    yield* switchTo(hero);
    let t = 0;
    let atkT = 0;
    while (!obj.active) {
      t += dt;
      if (t > (o.timeout ?? 25)) throw new Error('hitObject timeout ' + obj.constructor.name);
      if (G.state === 'dialog' || G.state === 'cine') {
        yield* dialogs();
        continue;
      }
      if (engaged(10).length) {
        yield* fight({ r: 20 });
        continue;
      }
      if (o.until && o.until()) break;
      const p = pos();
      if (P().state === 'climb') {
        // walked into a wall on the way: let go and back off a little
        press('drop');
        stickTo(p.x - obj.pos.x, p.z - obj.pos.z, 1);
        yield;
        yield* wait(0.3);
        continue;
      }
      const d = dxz(obj.pos.x, obj.pos.z);
      const reach = active() === 'mirelle' ? 6 : 1.4 + obj.radius;
      // stop at a stand-off point on our side of the object (avoids climbing walls behind it)
      if (d > reach * 0.85) stickTo(obj.pos.x - p.x, obj.pos.z - p.z, d > reach * 0.85 + 1.5 ? 1 : 0.28);
      else {
        clearIn();
        atkT -= dt;
        if (atkT <= 0) {
          press('attack');
          atkT = 0.25;
        }
        if (o.skill && G.party.activeMember.skillCd <= 0) press('skill');
      }
      yield;
    }
    clearIn();
  }

  /** Apply element A, switch, then trigger with B (reaction puzzles). */
  function* reactOn(obj, a, b) {
    const E = { rowan: 1, mirelle: 2, wren: 3, idris: 4 };
    let tries = 0;
    while (!obj.active && tries < 10) {
      tries++;
      try {
        yield* hitObject(obj, a, { until: () => obj.aura.elem === E[a], timeout: 12 });
        yield* hitObject(obj, b, { until: () => obj.active || obj.aura.elem === E[b], timeout: 5 });
      } catch (e) {
        if (String(e.message) === 'RESTART') throw e;
        log('reactOn retry: ' + e.message);
      }
      // wait for any wrong aura to fade before retrying
      if (!obj.active && obj.aura.elem !== 0) yield* waitUntil(() => obj.aura.elem === 0 || obj.active, 9, 'aura fade');
    }
    if (!obj.active) throw new Error('reaction puzzle failed');
  }

  function* fastTravel(id) {
    log('fast travel -> ' + id);
    yield* waitUntil(() => G.state === 'play' && !G.enemies.inCombat, 30, 'calm before travel');
    S.openMap();
    yield* wait(0.6);
    shot('map_' + id);
    S.clickWaystone(id);
    yield* wait(1.5);
    yield* waitUntil(() => G.state === 'play' && P().state === 'ground', 10, 'arrival');
    ev('fasttravel');
  }

  // movement-state trace (diagnostics): logs every player state change with position and stamina
  let lastSt = '';
  B.traceTick = () => {
    if (!B.trace) return;
    const st = P().state;
    if (st === lastSt) return;
    lastSt = st;
    const p = pos();
    log(`  state ${st} at (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) sta=${P().stamina.toFixed(0)} yaw=${G.cam.yaw.toFixed(2)} mv=(${V.move.x.toFixed(2)},${V.move.y.toFixed(2)})`);
  };

  window.__updrafts = Object.fromEntries(S.layout.UPDRAFTS.map((u) => [u.id, u]));
  B.api = { goto, path, talk, fight, ride, rideChain, glideTo, hitObject, reactOn, fastTravel, switchTo, wait, waitUntil, dialogs, interactId, waitStamina, log, ev, shot, stickTo, press, hold, clearIn, pos, dxz, P, engaged, foes };
})();
