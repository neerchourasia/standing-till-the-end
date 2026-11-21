// features.js - extras that sit on top of game.js:
// daily challenge, achievements, night dire wolf, sound, leg animation,
// mini-map, touch controls, leaderboard and other players.
// game.js calls into window.Features at a few points (init, update, render, events).
(function () {
  'use strict';

  const TODAY = Math.floor(Date.now() / 86400000);   // same "day number" for everyone (UTC)

  const CHALLENGES = [
    { id: 'rabbits', text: 'Catch 5 rabbits', goal: 5 },
    { id: 'tame', text: 'Tame 2 animals', goal: 2 },
    { id: 'days', text: 'Survive 3 days in one run', goal: 3 },
    { id: 'abilities', text: 'Use your ability 6 times', goal: 6 },
    { id: 'swim', text: 'Swim 15 tiles', goal: 15 },
    { id: 'coins', text: 'Earn 6 coins in one run', goal: 6 },
  ];
  const ACH = {
    tamer: ['Tamer', 'Tame your first animal'],
    night: ['Night owl', 'Survive your first night'],
    day3: ['Survivor', 'Survive 3 days'],
    day7: ['Veteran', 'Survive 7 days'],
    pets4: ['Animal lover', 'Have 4 pets at once'],
    buy3: ['Collector', 'Buy 3 animals'],
    hunter: ['Hunter', 'Catch 10 rabbits in total'],
    swimmer: ['Swimmer', 'Swim 30 tiles in total'],
    boss: ['Dire survivor', 'Live through a night with the dire wolf'],
  };

  // saved per account
  let ach = [], stats = { rabbits: 0, swim: 0 }, dailyDone = 0;
  // per run
  let run = { rabbits: 0, tame: 0, abilities: 0, swim: 0, coins: 0 };
  let boss = null, rewarding = false;
  let muted = false, stepT = 0;

  const el = id => document.getElementById(id);
  const todays = () => CHALLENGES[TODAY % CHALLENGES.length];
  const progress = () => { const c = todays(); return c.id === 'days' ? Math.max(0, day - 1) : (run[c.id] || 0); };

  // ---------- achievements and daily challenge ----------
  function unlock(id) {
    if (ach.includes(id)) return;
    ach.push(id);
    say('Achievement unlocked: ' + ACH[id][0] + '!');
    beep(660, 0.2);
    writeAccount();
  }
  function checkDaily() {
    const c = todays();
    if (dailyDone === TODAY || progress() < c.goal) return;
    dailyDone = TODAY;
    rewarding = true; addCoins(10); rewarding = false;
    say('Daily challenge complete: ' + c.text + '! +10 coins');
    beep(880, 0.2);
    writeAccount();
  }

  // ---------- sound (synthesised, no audio files) ----------
  function ac() {
    try {
      if (!window.AC) window.AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      return AC;
    } catch (e) { return null; }
  }
  function noise(ctx, sec) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function footstep(inWater) {
    const ctx = ac(); if (!ctx || muted) return;
    const src = ctx.createBufferSource(); src.buffer = noise(ctx, 0.08);
    const f = ctx.createBiquadFilter(); f.type = inWater ? 'bandpass' : 'lowpass'; f.frequency.value = inWater ? 1200 : 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(inWater ? 0.05 : 0.035, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
  }
  function howl() {
    const ctx = ac(); if (!ctx || muted) return;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(250, t); o.frequency.linearRampToValueAtTime(430, t + 0.9); o.frequency.linearRampToValueAtTime(220, t + 2.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 2.2);
    o.connect(f); f.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 2.3);
  }
  let rainGain = null;
  function rainSound(on) {
    const ctx = ac(); if (!ctx) return;
    if (!rainGain) {
      const src = ctx.createBufferSource(); src.buffer = noise(ctx, 2); src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500;
      rainGain = ctx.createGain(); rainGain.gain.value = 0;
      src.connect(bp); bp.connect(rainGain); rainGain.connect(ctx.destination); src.start();
    }
    rainGain.gain.setTargetAtTime(on && !muted ? 0.03 : 0, ctx.currentTime, 0.5);
  }
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyM' && typeof currentUser !== 'undefined' && currentUser) {
      muted = !muted; say(muted ? 'Sound off' : 'Sound on');
    }
    ac();
  });

  // ---------- night dire wolf ----------
  function manageBoss(night) {
    if (night && !boss && darkness > 0.9) {
      const s = freeSpot(22);
      const mesh = makeWolf(); mesh.scale.setScalar(2.2);
      world.add(mesh);
      boss = { x: s.x, y: s.y, t: 0, a: 0, cool: 0, h: 0, mesh, big: true };
      wolves.push(boss);
      say('A dire wolf prowls the night! Stay near the den.');
      howl();
    } else if (boss && darkness < 0.15) {
      world.remove(boss.mesh);
      wolves.splice(wolves.indexOf(boss), 1);
      boss = null;
      say('The dire wolf slinks away at dawn.');
      unlock('boss');
    }
  }

  // ---------- leg animation ----------
  function legsOf(mesh) {
    if (!mesh.userData.legs) {
      const list = [];
      mesh.traverse(o => { if (o.userData && o.userData.leg) list.push(o); });
      mesh.userData.legs = list;
    }
    return mesh.userData.legs;
  }
  function animateLegs(mesh, active, speed) {
    if (!mesh) return;
    for (const leg of legsOf(mesh)) {
      const target = active ? Math.sin(time * speed + leg.userData.ph) * 0.6 : 0;
      leg.rotation.x += (target - leg.rotation.x) * (active ? 0.6 : 0.2);
    }
  }

  // ---------- mini-map ----------
  const mini = document.createElement('canvas');
  mini.id = 'minimap'; mini.width = 140; mini.height = 140;
  document.body.appendChild(mini);
  const mctx = mini.getContext('2d');
  let terrain = null, cell = 1;
  function buildTerrain() {
    cell = 140 / Math.max(COLS, ROWS);
    terrain = document.createElement('canvas'); terrain.width = 140; terrain.height = 140;
    const g = terrain.getContext('2d');
    g.fillStyle = '#4f8f3a'; g.fillRect(0, 0, 140, 140);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = map[y][x];
      if (t === T_WATER) g.fillStyle = '#2a6fb8';
      else if (t === T_TREE) g.fillStyle = '#1f5e2a';
      else if (t === T_DEN) g.fillStyle = '#5a4630';
      else continue;
      g.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }
  function drawMini() {
    if (!terrain) return;
    mctx.drawImage(terrain, 0, 0);
    const dot = (x, y, r, color) => { mctx.fillStyle = color; mctx.beginPath(); mctx.arc(x * cell, y * cell, r, 0, 6.28); mctx.fill(); };
    for (const w of wolves) dot(w.x, w.y, w.big ? 4 : 2, '#e03030');
    for (const p of pets) dot(p.x, p.y, 2, '#4aa3ff');
    for (const id in ghosts) dot(ghosts[id].x, ghosts[id].y, 3, '#ffa500');
    dot(P.x, P.y, 3, '#ffffff');
  }

  // ---------- touch controls ----------
  const touch = document.createElement('div');
  touch.id = 'touch';
  touch.innerHTML =
    '<div class="pad"><button data-key="ArrowUp">▲</button><button data-key="ArrowLeft">◀</button><button data-key="ArrowRight">▶</button><button data-key="ArrowDown">▼</button></div>' +
    '<div class="acts"><button data-act="interact">E</button><button data-act="tame">T</button><button data-act="ability">★</button><button data-key="Space">⇧</button></div>';
  document.body.appendChild(touch);
  for (const b of touch.querySelectorAll('button')) {
    const key = b.dataset.key, act = b.dataset.act;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (key) keys[key] = true;
      else if (act === 'interact') { keys.KeyE = true; interact(); }
      else if (act === 'tame') tame();
      else if (act === 'ability') useAbility();
    });
    const up = () => { if (key) keys[key] = false; if (act === 'interact') keys.KeyE = false; };
    b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  }

  // ---------- other players ----------
  const ghosts = {};   // username -> {mesh, x, y, h, alt}
  function label(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(text, 128, 42);
    g.fillStyle = '#fff'; g.fillText(text, 128, 42);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    s.scale.set(4, 1, 1);
    return s;
  }
  function clearGhosts() {
    for (const id in ghosts) { scene.remove(ghosts[id].mesh); delete ghosts[id]; }
  }
  async function poll() {
    if (typeof currentUser === 'undefined' || !currentUser || paused || over || document.hidden) {
      if (!currentUser) clearGhosts();
      return;
    }
    try {
      const r = await fetch('/api/presence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentUser, hash: currentHash, animal: animalKey, x: P.x, y: P.y, h: P.h, alt: P.alt }),
      });
      if (!r.ok) return;
      const j = await r.json();
      const seen = new Set();
      for (const o of j.others || []) {
        if (!ANIMALS[o.animal] || o.username === currentUsername) continue;
        seen.add(o.username);
        let g = ghosts[o.username];
        if (!g) {
          const mesh = ANIMALS[o.animal].build();
          mesh.scale.setScalar(ANIMALS[o.animal].scale);
          const tag = label(o.username); tag.position.set(0, 3.2, 0); mesh.add(tag);
          scene.add(mesh);
          g = ghosts[o.username] = { mesh, x: o.x, y: o.y, h: o.h, alt: o.alt || 0, animal: o.animal };
        }
        g.tx = o.x; g.ty = o.y; g.th = o.h; g.talt = o.alt || 0;
      }
      for (const id in ghosts) if (!seen.has(id)) { scene.remove(ghosts[id].mesh); delete ghosts[id]; }
    } catch (e) { /* offline or no server: just no other players */ }
  }
  setInterval(poll, 1500);

  // ---------- menu panels: daily challenge, achievements, leaderboard ----------
  function menuPanel() {
    let box = el('menuExtras');
    if (!box) {
      box = document.createElement('div'); box.id = 'menuExtras';
      el('menu').insertBefore(box, el('cards'));
    }
    box.textContent = '';
    const line = (text, cls) => { const p = document.createElement('p'); p.textContent = text; if (cls) p.className = cls; box.appendChild(p); return p; };
    const c = todays();
    line('Daily challenge: ' + c.text + (dailyDone === TODAY ? '  ✓ done' : '  (reward 10 coins)'), 'extra-line');
    line('Achievements ' + ach.length + '/' + Object.keys(ACH).length + ':  ' +
      Object.keys(ACH).map(k => (ach.includes(k) ? '★ ' : '☆ ') + ACH[k][0]).join('  ·  '), 'extra-line small');
    const btn = document.createElement('button'); btn.textContent = 'Show leaderboard';
    const list = document.createElement('div'); list.id = 'lbBox';
    btn.onclick = async () => {
      list.textContent = 'Loading...';
      try {
        const r = await fetch('/api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const j = await r.json();
        list.textContent = '';
        if (!j.board || !j.board.length) { list.textContent = 'No scores yet. Be the first!'; return; }
        j.board.forEach((row, i) => { const d = document.createElement('div'); d.textContent = (i + 1) + '. ' + row.username + ' - ' + row.score + ' days'; list.appendChild(d); });
      } catch (e) { list.textContent = 'Leaderboard is not available right now.'; }
    };
    box.appendChild(btn); box.appendChild(list);
  }

  // ---------- the interface game.js talks to ----------
  window.Features = {
    // account data
    load(data) {
      ach = Array.isArray(data.ach) ? data.ach : [];
      stats = data.stats || { rabbits: 0, swim: 0 };
      dailyDone = data.dailyDone || 0;
    },
    saveData() { return { ach, stats, dailyDone }; },

    onInit() {
      run = { rabbits: 0, tame: 0, abilities: 0, swim: 0, coins: 0 };
      boss = null; stepT = 0;
      clearGhosts();
      buildTerrain();
      for (const p of pets) { /* pets reset in init */ }
    },
    onMenu() { menuPanel(); },

    event(name, arg) {
      if (name === 'rabbit') { run.rabbits++; stats.rabbits++; if (stats.rabbits >= 10) unlock('hunter'); }
      else if (name === 'tame') { run.tame++; unlock('tamer'); }
      else if (name === 'ability') run.abilities++;
      else if (name === 'dawn') {
        if (arg >= 2) unlock('night');
        if (arg - 1 >= 3) unlock('day3');
        if (arg - 1 >= 7) unlock('day7');
      } else if (name === 'buy') { if (owned.length >= 3) unlock('buy3'); }
      checkDaily();
    },
    coinsEarned(n) { if (!rewarding) { run.coins += n; checkDaily(); } },

    onDeath(days) {
      if (!currentUser) return;
      fetch('/api/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentUser, hash: currentHash, username: currentUsername, animal: animalKey, days }),
      }).catch(() => {});
    },

    onUpdate(dt, night) {
      manageBoss(night);
      if (pets.length >= 4) unlock('pets4');
      const inWater = tileAt(P.x, P.y) === T_WATER;
      if (moving && inWater) {
        run.swim += 2 * dt; stats.swim += 2 * dt;
        if (stats.swim >= 30) unlock('swimmer');
      }
      if (moving && P.alt < 0.3) {
        stepT += dt;
        if (stepT > 0.32) { stepT = 0; footstep(inWater); }
      }
      rainSound(rainT > 0);
      checkDaily();
    },

    onRender(dt) {
      // legs swing while walking (the player, wolves)
      animateLegs(playerMesh, moving && P.alt < 0.3, 14);
      for (const w of wolves) animateLegs(w.mesh, true, 10);
      // other players glide toward their latest position
      const k = 1 - Math.exp(-dt * 6);
      for (const id in ghosts) {
        const g = ghosts[id];
        if (g.tx !== undefined) { g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k; g.h += (g.th - g.h) * k; g.alt += (g.talt - g.alt) * k; }
        g.mesh.position.set(g.x * S, g.alt, g.y * S);
        g.mesh.rotation.y = g.h;
      }
      // mini-map and touch controls only while playing
      mini.style.display = paused ? 'none' : 'block';
      touch.style.visibility = paused ? 'hidden' : 'visible';
      if (!paused) drawMini();
      // daily challenge progress next to the stats
      const c = todays();
      el('info').textContent += ' · Daily: ' + (dailyDone === TODAY ? 'done' : Math.min(progress(), c.goal) + '/' + c.goal);
    },
  };
})();
