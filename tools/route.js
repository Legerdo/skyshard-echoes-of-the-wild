// Main-quest route for the in-page bot. Each quest step has a task; the runner re-reads the current
// step after every task, so the route resumes correctly after Continue from a save.
(() => {
  const B = window.__bot;
  const A = B.api;
  const S = window.__sky;
  const G = S.game;
  const L = S.layout;
  const C = G.content;
  const { goto, path, talk, fight, ride, rideChain, glideTo, hitObject, reactOn, fastTravel, switchTo, wait, waitUntil, dialogs, interactId, waitStamina, log, ev, shot, stickTo, press, hold, clearIn, pos, dxz, P } = A;
  const campDone = (id) => G.story.campDone(id);
  const near = (x, z, r) => dxz(x, z) < r;

  function* fightCamp(id, x, z, r = 30) {
    yield* goto(x, z, 8, { fightR: 16 });
    yield* fight({ r, all: true, until: () => campDone(id) || !G.enemies.camps.get(id)?.active });
  }
  function* openChest(id) {
    const c = C.chest(id);
    if (!c || c.opened) return;
    yield* interactId(id, () => c.pos);
    if (c.opened) ev('chest_' + id);
  }
  function* jumpOffGlide(edgeX, edgeZ, tx, tz, ty) {
    // walk off a high edge, open the wind-wing, glide to a target
    let t = 0;
    while (P().state === 'ground' && t < 6) {
      stickTo(edgeX - pos().x, edgeZ - pos().z, 1);
      t += 1 / 60;
      yield;
    }
    press('jump');
    yield* glideTo(tx, tz, ty);
  }

  const T = {};
  // ================= Chapter I =================
  T.dock = function* () {
    shot('01_start_dock');
    yield* talk('mirelle');
  };
  T.road = function* () {
    yield* path([[40, 366]], 2.5);
    yield* openChest('ch_dock');
    yield* path([[40, 358], [38, 344], [37, 334]], 3);
    yield* waitUntil(() => G.story.stepId !== 'road', 10, 'ambush trigger');
  };
  T.ambush = function* () {
    yield* wait(0.5);
    shot('02_combat_start');
    let shotTaken = false;
    yield* fight({
      r: 40,
      all: true,
      until: () => {
        if (!shotTaken && G.combat.stats.reactions > 0) {
          shotTaken = true;
          shot('03_reaction');
        }
        return campDone('fields');
      },
    });
    yield* waitUntil(() => G.story.stepId !== 'ambush', 20, 'ambush end');
  };
  T.elder = function* () {
    yield* path([[35, 320], [30, 304], [36, 288]], 3);
    shot('04_village');
    yield* talk('elder');
  };
  T.wren = function* () {
    yield* path([[8, 284], [-20, 272], [-50, 254], [-74, 240], [-78, 228]], 3);
    shot('05_windmill');
    // climb the windmill tower to Wren (climbing is triggered by walking into the wall)
    const n = C.npcs.get('wren');
    let climbShot = false;
    B.onClimb = () => {
      if (!climbShot && P().state === 'climb' && pos().y > n.pos.y - 12) {
        climbShot = true;
        shot('06_climbing');
      }
    };
    yield* talk('wren');
    B.onClimb = null;
    yield* waitUntil(() => G.story.stepId !== 'wren', 30, 'wren joins');
  };
  T.tree = function* () {
    // collect the plume on the windmill top, then glide down toward the village
    const top = C.spots.windmillTop;
    if (pos().y > top.y - 1 && dxz(top.x, top.z) < 6) {
      const pl = C.pickup('pl_windmill');
      if (pl && !pl.taken) yield* goto(pl.pos.x, pl.pos.z, 0.8, { noFight: true, timeout: 20 });
      shot('07_vista_top');
      yield* jumpOffGlide(top.x + 7, top.z + 5, -30, 256, 18);
      shot('08_after_glide');
    }
    yield* path([[8, 284], [42, 280], [66, 276], [92, 272], [118, 256], [150, 232], [174, 206], [182, 192], [181, 176], [177, 158], [170, 142], [161, 130], [150, 122], [140, 133.5]], 3);
    yield* goto(C.spots.treeFront.x, C.spots.treeFront.z, 3);
    yield* waitUntil(() => G.story.stepId !== 'tree', 20, 'tree arrival');
  };
  // The Elder Tree's roots radiate out to ~17 m: move around the trunk on a ring outside them.
  const TREE = L.P.elderTree;
  const angOf = (x, z) => Math.atan2(z - TREE.z, x - TREE.x);
  function* treeArc(targetAng, R = 21) {
    const a0 = angOf(pos().x, pos().z);
    yield* goto(TREE.x + Math.cos(a0) * R, TREE.z + Math.sin(a0) * R, 2.5);
    const da = Math.atan2(Math.sin(targetAng - a0), Math.cos(targetAng - a0));
    const n = Math.max(1, Math.ceil(Math.abs(da) / 0.4));
    for (let i = 1; i <= n; i++) {
      const a = a0 + (da * i) / n;
      yield* goto(TREE.x + Math.cos(a) * R, TREE.z + Math.sin(a) * R, 2.5);
    }
  }
  T.blooms = function* () {
    // visit the blooms around the trunk (never cutting through the tree or its roots)
    for (const i of [0, 2, 1]) {
      const b = C.blooms[i];
      if (b.active) continue;
      yield* treeArc(angOf(b.pos.x, b.pos.z));
      yield* hitObject(b, 'mirelle', { skill: true });
    }
    shot('09_blooms');
    yield* waitUntil(() => G.story.stepId !== 'blooms', 20, 'blooms done');
  };
  T.seal = function* () {
    const f = C.spots.treeFront;
    if (dxz(f.x, f.z) > 4) yield* treeArc(angOf(f.x, f.z));
    yield* goto(C.spots.treeFront.x, C.spots.treeFront.z, 2);
    yield* hitObject(C.seal, 'rowan');
    yield* waitUntil(() => G.story.stepId !== 'seal', 20, 'seal burned');
  };
  T.guardian = function* () {
    yield* waitUntil(() => G.enemies.list.some((e) => e.alive && e.def.id === 'elderThornback'), 10, 'guardian spawn');
    shot('10_boss_thornback');
    yield* fight({ r: 45, all: true, until: () => campDone('thornback') });
    yield* waitUntil(() => G.story.stepId !== 'guardian', 20, 'guardian end');
  };
  T.shard1 = function* () {
    yield* waitUntil(() => C.shards[0].group.visible, 10, 'shard visible');
    yield* interactId('shard0', () => new THREE_V(C.shards[0].pos.x, C.shards[0].pos.y - 2, C.shards[0].pos.z));
    yield* wait(1.5);
    shot('11_shard1');
    yield* waitUntil(() => G.story.stepId !== 'shard1', 60, 'shard1 sequence');
  };
  T.return1 = function* () {
    if (!B.reloadDone) {
      // save/reload/continue verification happens here (driven by the node runner)
      G.saveGame(true);
      B.snapshot = { main: G.save.main, shards: [...G.save.shards], unlocked: [...G.party.unlocked], level: G.party.level, glimmer: G.save.inv.glimmer, chests: G.save.chests.length };
      B.reloadRequested = true;
      log('requesting reload for the save/continue test');
      while (true) yield; // the page is reloaded by the runner
    }
    if (!near(24, 282, 60)) yield* fastTravel('ws_village');
    yield* talk('elder');
  };
  // ================= Chapter II =================
  T.ashgate = function* () {
    if (near(24, 282, 90)) yield* path([[8, 284], [-20, 272], [-50, 254], [-94, 238], [-116, 204], [-114, 172]], 3);
    else if (!near(-124, 146, 60)) yield* fastTravel('ws_windmill');
    if (!campDone('bramble')) {
      yield* fightCamp('bramble', -40, 140);
      shot('12_enemy_camp');
      yield* openChest('ch_bramble');
    }
    yield* path([[-96, 156], [-114, 146], [-124, 146]], 3);
    yield* goto(C.spots.ashgateOut.x, C.spots.ashgateOut.z, 6);
    yield* waitUntil(() => G.story.stepId !== 'ashgate', 20, 'ashgate trigger');
  };
  T.defend = function* () {
    yield* wait(0.6);
    shot('13_ashgate_defense');
    yield* fight({ r: 45, all: true, until: () => campDone('ashgate') });
    yield* waitUntil(() => G.story.stepId !== 'defend', 30, 'defend end');
  };
  T.spire = function* () {
    yield* waitUntil(() => C.portcullis.k > 0.9, 8, 'gate open');
    const a = L.BRIDGE.a;
    const b = L.BRIDGE.b;
    const at = (k) => [a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k];
    if (pos().z > 30) {
      yield* path([[-140, 132], [-152, 118], [-166, 104], [-188, 80], [-202, 58], at(-0.05), at(0.2)], 2.5);
      yield* goto(...at(0.33), 0.8, { noFight: true });
      yield* waitStamina();
      // glide over the broken span, riding the chasm's heat
      shot('14_broken_bridge');
      const far = at(0.72);
      let t = 0;
      while (P().state === 'ground' && t < 3) {
        stickTo(b.x - a.x, b.z - a.z, 1);
        if (t > 0.35) press('jump');
        t += 1 / 60;
        yield;
      }
      yield* wait(0.15);
      yield* glideTo(far[0], far[1], L.BRIDGE.deck);
      if (pos().y < 15) throw new Error('fell into the chasm');
    }
    yield* path([at(0.9), [-219, 10], [-226, 0], [-244, -32], [-258, -60], [-262, -72]], 3);
    yield* waitUntil(() => G.story.stepId !== 'spire', 20, 'spire arrival');
  };
  const [B1, B2, B3] = C.beacons;
  const ROCK = L.FLOATING_ISLES.find((f) => f.id === 'emberRock');
  /** Climb the heat-updraft chain up to a given stage (1 = L1 ledge, 2 = ember rock, 3 = L3 ledge). */
  function* spireStage(stage) {
    for (let k = 0; k < 4; k++) {
      const y = pos().y;
      if (stage >= 1 && y < 45) yield* ride('spireFloor', B1.pos.x, B1.pos.z, B1.pos.y);
      else if (stage >= 2 && y < 80) yield* ride('spireL1', ROCK.x, ROCK.z, ROCK.top);
      else if (stage >= 3 && (y < 89 || dxz(B3.pos.x, B3.pos.z) > 10)) yield* ride('spireRock', B3.pos.x, B3.pos.z, B3.pos.y);
      else return;
    }
  }
  T.beacons = function* () {
    if (!campDone('spirebase') && pos().y < 40) yield* fightCamp('spirebase', -236, -128, 36);
    if (!B1.active) {
      yield* spireStage(1);
      shot('15_spire_updraft');
      yield* hitObject(B1, 'rowan');
    }
    if (!B2.active) {
      yield* spireStage(2);
      yield* hitObject(B2, 'rowan');
    }
    if (!B3.active) {
      yield* spireStage(3);
      yield* hitObject(B3, 'rowan');
    }
    yield* waitUntil(() => G.story.stepId !== 'beacons', 20, 'beacons done');
  };
  /** From anywhere around the spire: get back up to the summit plateau (updraft chain, then the wall climb). */
  function* climbSpire() {
    for (let k = 0; k < 5 && pos().y < 117; k++) {
      if (pos().y < 88 || dxz(L.P.spire.x, L.P.spire.z) > 40) yield* spireStage(3);
      try {
        yield* goto(L.P.spire.x, L.P.spire.z, 18, { y: 124, yTol: 6, noFight: true, timeout: 60, climb: true });
      } catch (e) {
        if (String(e.message) === 'RESTART') throw e;
        log('summit climb retry: ' + e.message);
      }
    }
  }
  T.summit = function* () {
    yield* climbSpire();
    shot('16_spire_summit');
    yield* waitUntil(() => G.story.stepId !== 'summit', 20, 'summit trigger');
  };
  T.cinderhorn = function* () {
    yield* waitUntil(() => G.enemies.list.some((e) => e.alive && e.def.id === 'cinderhorn'), 12, 'cinderhorn spawn');
    shot('17_boss_cinderhorn');
    while (!campDone('cinderhorn')) {
      // knocked off the plateau: climb back up and continue the fight
      if (pos().y < 112) {
        log('off the summit during the boss fight, climbing back');
        yield* climbSpire();
      }
      yield* fight({ r: 40, all: true, until: () => campDone('cinderhorn') || pos().y < 112 });
    }
    yield* waitUntil(() => G.story.stepId !== 'cinderhorn', 30, 'cinderhorn end');
  };
  T.shard2 = function* () {
    yield* waitUntil(() => C.shards[1].group.visible, 10, 'shard2 visible');
    yield* interactId('shard1', () => new THREE_V(C.shards[1].pos.x, C.shards[1].pos.y - 2, C.shards[1].pos.z));
    yield* wait(1.5);
    shot('18_shard2');
    yield* waitUntil(() => G.story.stepId !== 'shard2', 60, 'shard2 sequence');
  };
  // ================= Chapter III =================
  T.camp = function* () {
    if (!near(148, -20, 120)) {
      yield* fastTravel('ws_elder');
      yield* path([[150, 122], [161, 130], [170, 142], [177, 158], [181, 176], [184, 192], [196, 184], [204, 170], [206, 136], [200, 110], [193, 86], [186, 62], [178, 38], [168, 12], [156, -8]], 3);
    }
    shot('19_azure_highlands');
    yield* talk('sorrel');
  };
  T.terrace = function* () {
    yield* path([[146, -30], [148, -70], [160, -104], [180, -128], [196, -134], [204, -140]], 3);
    yield* waitUntil(() => G.story.stepId !== 'terrace', 20, 'terrace trigger');
  };
  T.totems = function* () {
    for (const tt of C.totems) if (!tt.active) yield* hitObject(tt, 'wren');
    yield* waitUntil(() => G.story.stepId !== 'totems', 20, 'totems done');
  };
  const I1 = L.FLOATING_ISLES.find((f) => f.id === 'azure1');
  const I2 = L.FLOATING_ISLES.find((f) => f.id === 'azure2');
  const onIsle = (f) => dxz(f.x, f.z) < f.r + 1 && Math.abs(pos().y - f.top) < 2.5 && P().grounded;
  /**
   * Wind road: terrace column -> isle 1 column -> isle 2 column -> temple top, chained in one flight
   * (Wren's light glide makes it). Restarts from wherever a missed column or landing ends.
   */
  function* windRoad() {
    const T0 = [L.P.temple.x, L.P.temple.z, L.H.templeTop, { below: 1.5 }];
    for (let k = 0; k < 8 && pos().y < L.H.templeTop - 3; k++) {
      try {
        if (onIsle(I2)) yield* rideChain(['azure2'], ...T0);
        else if (onIsle(I1)) yield* rideChain(['azure1', 'azure2'], ...T0);
        else {
          if (k > 0) log('missed the wind road, back to the terrace column');
          if (dxz(L.P.terrace.x, L.P.terrace.z) > 40) yield* goto(L.P.terrace.x, L.P.terrace.z, 8);
          // screenshot mid-flight over the first isle
          B.onClimb = () => {
            if (P().state === 'glide' && dxz(I1.x, I1.z) < 6 && pos().y > I1.top + 8) {
              shot('20_wind_road');
              B.onClimb = null;
            }
          };
          yield* rideChain(['terrace', 'azure1', 'azure2'], ...T0);
          B.onClimb = null;
        }
      } catch (e) {
        if (String(e.message) === 'RESTART') throw e;
        log('wind road retry: ' + e.message);
        yield* waitUntil(() => P().grounded || P().state === 'swim', 30, 'landing after a miss');
      }
    }
  }
  T.windroad = function* () {
    yield* windRoad();
    shot('21_temple');
    yield* goto(L.P.temple.x, L.P.temple.z, 10);
    yield* waitUntil(() => G.story.stepId !== 'windroad', 20, 'temple arrival');
  };
  const anyDown = () => G.party.members.some((m, i) => G.party.isUnlocked(i) && !m.alive);
  /** Fast-travel to a waystone and rest there (revives fallen party members). */
  function* restoreParty(wsId) {
    log('resting at ' + wsId + ' to revive the party');
    yield* fastTravel(wsId);
    const w = C.waystones.find((x) => x.id === wsId);
    yield* interactId('ws_' + w.id, () => w.pos);
    ev('rest_waystone');
  }
  const offTemple = () => pos().y < L.H.templeTop - 6;
  function* backToTemple() {
    log('off the temple top, taking the wind road back');
    yield* windRoad();
    yield* goto(L.P.temple.x, L.P.temple.z, 10);
  }
  T.pylons = function* () {
    if (offTemple()) yield* backToTemple();
    yield* waitUntil(() => campDone('templeguard') || G.enemies.camps.get('templeguard')?.active, 10, 'temple guards');
    while (!campDone('templeguard') && G.enemies.camps.get('templeguard')?.active) {
      if (offTemple()) yield* backToTemple();
      yield* fight({ r: 34, all: true, until: () => campDone('templeguard') || !G.enemies.camps.get('templeguard')?.active || offTemple() });
    }
    const [p0, p1, p2] = C.pylons;
    const pairs = [[p0, 'rowan', 'mirelle'], [p1, 'mirelle', 'wren'], [p2, 'idris', 'wren']];
    for (const [pl, a, b] of pairs) {
      if (pl.active) continue;
      if (!G.party.member(a).alive || !G.party.member(b).alive) {
        // the reaction needs both heroes standing
        yield* restoreParty('ws_terrace');
        yield* backToTemple();
      }
      if (offTemple()) yield* backToTemple();
      yield* reactOn(pl, a, b);
    }
    yield* waitUntil(() => G.story.stepId !== 'pylons', 20, 'pylons done');
  };
  T.warden = function* () {
    yield* waitUntil(() => G.enemies.list.some((e) => e.alive && e.def.id === 'tempestWarden'), 15, 'warden spawn');
    shot('22_boss_warden');
    while (!campDone('warden')) {
      if (offTemple()) yield* backToTemple();
      yield* fight({ r: 40, all: true, until: () => campDone('warden') || offTemple() });
    }
    yield* waitUntil(() => G.story.stepId !== 'warden', 30, 'warden end');
  };
  T.shard3 = function* () {
    yield* waitUntil(() => C.shards[2].group.visible, 10, 'shard3 visible');
    yield* interactId('shard2', () => new THREE_V(C.shards[2].pos.x, C.shards[2].pos.y - 2, C.shards[2].pos.z));
    yield* wait(9);
    shot('23_sanctum_awakens');
    yield* waitUntil(() => G.story.stepId !== 'shard3', 90, 'sanctum awakening');
  };
  // ================= Finale =================
  T.gate = function* () {
    if (!near(0, -76, 140)) {
      yield* fastTravel('ws_village');
      yield* path([[24, 262], [20, 232], [10, 196], [0, 156], [-6, 116], [-4, 74], [0, 30], [0, -12], [0, -40], [8, -62], [14, -64]], 3);
    }
    // gather strength before the finale at the basin waystone right below the Sanctum
    // (touching it the first time restores the party; afterwards rest there explicitly)
    const wb = C.waystones.find((x) => x.id === 'ws_basin');
    yield* goto(wb.pos.x, wb.pos.z + 2.5, 2);
    if (anyDown()) {
      yield* interactId('ws_' + wb.id, () => wb.pos);
      ev('rest_waystone');
    }
    yield* goto(L.P.gate.x, L.P.gate.z + 8, 4);
    yield* waitUntil(() => G.story.stepId !== 'gate', 20, 'gate trigger');
  };
  T.ascend = function* () {
    const e = C.spots.sanctumEntry;
    shot('24_starlift');
    yield* ride('starlift', e.x, e.z, e.y, { below: 4 });
    shot('25_sanctum');
    yield* goto(e.x, e.z - 6, 4);
    yield* waitUntil(() => G.story.stepId !== 'ascend', 20, 'sanctum arrival');
  };
  T.sovereign = function* () {
    const Aa = L.SANCTUM_ARENA;
    if (!G.story.sov) yield* goto(Aa.x, Aa.z + 14, 4, { noFight: true });
    yield* waitUntil(() => G.story.sov && G.story.sov.alive && G.state === 'play' && G.story.sovIntroT <= 0, 30, 'sovereign intro');
    shot('26_final_boss');
    let p2 = false;
    let p3 = false;
    const special = function* (e) {
      const sv = S.sovereign();
      if (!sv) return false;
      if (sv.phase >= 2 && !p2) {
        p2 = true;
        shot('27_boss_phase2');
      }
      if (sv.phase >= 3 && !p3) {
        p3 = true;
        shot('28_boss_phase3');
      }
      const p = pos();
      // supernova: stand under the Sovereign
      if (sv.nova) {
        const d = Math.hypot(sv.x - p.x, sv.z - p.z);
        if (d > 2.5) {
          stickTo(sv.x - p.x, sv.z - p.z, 1);
          hold('sprint', true);
          yield;
          return true;
        }
      }
      // sweeping beam: jump over it
      if (sv.beamT > 0 && sv.beamT < 4.6) {
        const ang = Math.atan2(p.x - sv.x, p.z - sv.z);
        let d = ang - sv.beamAngle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (d > 0 && d < 0.42 && P().grounded) press('jump');
      }
      return false;
    };
    yield* fight({ r: 60, all: true, special, until: () => !G.story.sov || !G.story.sov.alive });
    yield* waitUntil(() => G.state === 'victory', 120, 'ending sequence');
  };
  T.done = function* () {
    yield* waitUntil(() => G.state === 'victory', 150, 'victory screen');
  };

  function* main() {
    while (true) {
      if (G.state === 'victory') {
        yield* wait(2.5);
        shot('29_victory');
        yield* wait(1.5);
        B.done = true;
        return;
      }
      if (G.state === 'intro') {
        press('interact');
        yield;
        continue;
      }
      if (G.state === 'defeat') {
        yield* wait(2.5);
        S.respawn();
        yield* wait(1.5);
        continue;
      }
      if (G.state !== 'play') {
        yield* dialogs();
        yield;
        continue;
      }
      const id = G.story.stepId;
      const task = T[id];
      if (!task) throw new Error('no task for step ' + id);
      log('>>> task ' + id);
      try {
        yield* task();
      } catch (e) {
        if (String(e.message) === 'RESTART') {
          log('restarting task after defeat');
          continue;
        }
        throw e;
      }
      let t = 0;
      while (G.story.stepId === id && G.state !== 'victory') {
        t += 1 / 60;
        if (t > 40) throw new Error('step did not advance: ' + id);
        yield* dialogs();
        yield;
      }
    }
  }

  // a tiny vector helper without importing three
  function THREE_V(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  const it = main();
  G.onPreFrame.push((dt) => {
    if (B.done || B.error || B.paused) return;
    B.setDt(dt);
    try {
      B.onClimb?.();
      B.traceTick();
      const r = it.next();
      if (r.done) B.done = true;
    } catch (e) {
      B.error = String(e && e.stack ? e.stack : e);
      console.log('[bot] ERROR ' + B.error);
      A.clearIn();
    }
  });
  log('route installed at step ' + G.story.stepId);
})();
