(function () {
  'use strict';
  var cv = document.getElementById('cv'), viewer = document.getElementById('viewer');
  var labelsEl = document.getElementById('labels'), captionEl = document.getElementById('caption');
  var subEl = document.getElementById('sub');
  var scrub = document.getElementById('scrub'), playBtn = document.getElementById('play');
  var stepEls = Array.prototype.slice.call(document.querySelectorAll('#steps li'));
  var V3 = THREE.Vector3;

  var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x17181b);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  var SMALL = Math.min(screen.width, screen.height) < 600;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.1, 200);
  camera.up.set(0, 0, 1);
  var controls = new THREE.OrbitControls(camera, cv);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 3; controls.maxDistance = 40;
  // soft studio: a dim room with two large panels lights the yarn (reflections and sheen), one key light casts shadows
  (function () {
    var room = new THREE.Scene(), box = new THREE.BoxGeometry(1, 1, 1);
    var walls = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x1c1d21, side: THREE.BackSide }));
    walls.scale.set(30, 30, 30); room.add(walls);
    [[0xfff1e0, 1.6, [8, -10, 12], [10, 0.4, 8]], [0xc9d6ff, 0.6, [-12, 8, 2], [0.4, 12, 8]], [0xffffff, 0.35, [0, 0, -14], [12, 12, 0.4]]].forEach(function (q) {
      var m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(q[0]).multiplyScalar(q[1]) }));
      m.position.set(q[2][0], q[2][1], q[2][2]); m.scale.set(q[3][0], q[3][1], q[3][2]); room.add(m);
    });
    var pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(room, 0.04).texture; pm.dispose();
  })();
  scene.add(new THREE.HemisphereLight(0xf4f0ea, 0x2a2c33, 0.12));
  var key = new THREE.DirectionalLight(0xfff4e8, 1.1); key.position.set(7, -9, 13); scene.add(key);
  key.castShadow = true; key.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048);
  var sc = key.shadow.camera; sc.left = sc.bottom = -8.5; sc.right = sc.top = 8.5; sc.near = 4; sc.far = 36;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 3;
  var fill = new THREE.DirectionalLight(0xa9c0ff, 0.45); fill.position.set(-8, 6, -4); scene.add(fill);
  // the key light rides with the camera, from its upper left, so every view shows the round of each thread
  var keyOff = new V3(-0.55, 0.75, 0.4);
  function placeKey() {
    var f = new V3().subVectors(camera.position, controls.target).normalize(), r = new V3().crossVectors(camera.up, f).normalize(), u = new V3().crossVectors(f, r);
    key.position.copy(f).multiplyScalar(keyOff.z).addScaledVector(r, keyOff.x).addScaledVector(u, keyOff.y).setLength(20);
    key.target.position.set(0, 0, 0); key.target.updateMatrixWorld();
  }
  var world = new THREE.Group(); scene.add(world);

  var VIEWS = { oblique: [0, -13.5, 8.5], top: [0, -0.01, 17], side: [0, -17, 0.6] };

  // ---------- colours ----------
  var hex = function (h) { return new THREE.Color(h).convertSRGBToLinear(); };
  var VIOLETS = [hex('#3c2f96'), hex('#4a33a0'), hex('#3b3699'), hex('#4b2f9c')];   // first band: deep blue-violet
  var BLUES = [hex('#b3bdf2'), hex('#c2c4f6'), hex('#aec6f0'), hex('#c4bdf3')];     // centre band: pale blue-violet
  var PINKS = [hex('#a9483a'), hex('#c85f50'), hex('#e8988a'), hex('#c85f50')];
  var GOLD = hex('#f2c14e'), GREY = hex('#4a4e57');
  function cyc(stops, u) {
    u = ((u % 1) + 1) % 1; var x = u * stops.length, i = Math.floor(x), f = x - i;
    return stops[i].clone().lerp(stops[(i + 1) % stops.length], f);
  }

  // ---------- timeline ----------
  // segments: 0 band of eight, 1 rim, 2 centre 1-8, 3 flower 9 close-up, 4 flowers 10-16, 5 finished
  var S = 1.5;                                       // overall slowness: every time below is multiplied by S
  var A_DUR = 2.0 * S, R_DUR = 0.9 * S, C_DUR = 1.6 * S, LEAD = 1.0 * S, PAD = 1.5 * S;
  var SEG = [], T = 0;
  function seg(len) { SEG.push([T, T + len]); T += len; }
  seg(LEAD + 8 * A_DUR); seg(PAD + 32 * R_DUR + PAD); seg(8 * C_DUR + 0.5 * S); seg(15 * S); seg(7 * C_DUR + 0.5 * S); seg(9 * S);
  var F9 = { inT: 2.5 * S, grow0: 3 * S, grow1: 11 * S, outT: 2 * S };      // inside segment 3

  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(x) { x = clamp(x); return x * x * (3 - 2 * x); }

  // start time and duration of each flower
  function sched(f) {
    if (f.step === 1) return [SEG[0][0] + LEAD + (f.n - 1) * A_DUR, A_DUR * 0.9];
    if (f.step === 2) return [SEG[1][0] + PAD + (f.n - 1) * R_DUR, R_DUR * 1.5];
    if (f.n <= 8) return [SEG[2][0] + (f.n - 1) * C_DUR, C_DUR * 0.9];
    if (f.n === 9) return [SEG[3][0] + F9.grow0, F9.grow1 - F9.grow0];
    return [SEG[4][0] + (f.n - 10) * C_DUR, C_DUR * 0.9];
  }
  function growth(f, tt) { var s = sched(f); return clamp((tt - s[0]) / s[1]); }
  function segAt(tt) { for (var i = 0; i < SEG.length; i++) if (tt < SEG[i][1]) return i; return SEG.length - 1; }
  function focusW(tt) {
    var s = SEG[3]; if (tt <= s[0] || tt >= s[1]) return 0;
    return ease((tt - s[0]) / F9.inT) * ease((s[1] - tt) / F9.outT);
  }

  // subtitle timing: [segment, offset (s)], texts come from I18N[lang].SUBS in the same order
  var SUB_T = [[0, 0], [0, 5], [0, 10], [0, 15.5], [1, 0], [1, 3], [1, 16], [1, 29.5], [2, 0], [2, 4],
               [3, 0], [3, 3], [3, 8.5], [3, 11.5], [4, 0], [5, 0]].map(function (x) { return SEG[x[0]][0] + x[1] * S; });
  function subAt(tt) { var cur = ''; SUB_T.forEach(function (st, i) { if (tt >= st - 1e-6) cur = L().SUBS[i]; }); return cur; }

  // ---------- language ----------
  var lang = 'en';
  try { lang = localStorage.getItem('tidings-lang') || ''; } catch (e) {}
  if (lang !== 'en' && lang !== 'zh') lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  var qm = /[?&]lang=(en|zh)/.exec(location.search); if (qm) lang = qm[1];
  function L() { return I18N[lang]; }
  function applyLang() {
    var d = L();
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = d.docTitle;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { el.textContent = d[el.getAttribute('data-i18n')]; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-alt]'), function (el) { el.alt = d[el.getAttribute('data-i18n-alt')]; });
    document.getElementById('mathBody').innerHTML = d.math.map(function (x) { return '<p>' + x + '</p>'; }).join('');
    playBtn.textContent = playing ? d.pause : (t >= T ? d.replay : d.play);
    labelDefs.forEach(function (x) { if (x.cls === 'band') x.el.textContent = d.band; });
    captionEl.textContent = ''; subEl.textContent = '';
  }
  document.getElementById('lang').addEventListener('click', function () {
    lang = lang === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('tidings-lang', lang); } catch (e) {}
    applyLang(); if (D) apply(t, 0);
  });

  // camera follows the work unless the viewer has just moved it (or turned following off)
  // While playing, the camera is driven by the animation and cannot be dragged. When paused, the viewer
  // may turn it; on resume it glides back (moveCam starts from wherever the viewer left it).
  var userMoved = false, followBox = document.getElementById('tFollow');
  function autoOn() { return followBox.checked && !userMoved; }

  // ---------- geometry ----------
  if (SMALL) Yarn.lowDetail();
  var GM = Yarn.M, TEX = Yarn.textures(renderer.capabilities.getMaxAnisotropy());

  var D, flowers, objs = [], focusSet = {}, petalSet = {}, surf, dbl, labelDefs = [];
  var t = 0, playing = false, last = 0, rate = 1;

  function vec(p) { return new V3(p[0], p[1], p[2]); }
  // view direction for a flower: outward from the cowl's core circle, tilted to the side it faces
  function flowerView(k) {
    var f = flowers[k], c = vec(f.c), tips = [];
    D.bunches.forEach(function (b) { if (b.f === k && b.c !== 'rim') tips.push(vec(b.p[b.p.length - 1]).sub(c)); });
    var n = new V3().crossVectors(tips[0], tips[2] || tips[1]).normalize();
    var core = new V3(c.x, c.y, 0).setLength(D.R), out = c.clone().sub(core);
    if (n.dot(out) < 0) n.negate();
    var v = n.clone().add(new V3(0, 0, n.z >= 0 ? 0.55 : -0.55)).normalize();
    return { c: c, n: n, v: v };
  }

  function build() {
    flowers = D.flowers;
    var rimsOf = {};
    D.bunches.forEach(function (b, i) { if (b.c === 'rim') (rimsOf[b.f] = rimsOf[b.f] || []).push(i); });
    var rank = {};
    Object.keys(rimsOf).forEach(function (f) {
      rimsOf[f].sort(function (a, b) { return D.bunches[a].o - D.bunches[b].o; }).forEach(function (i, j, arr) { rank[i] = [j, arr.length]; });
    });
    flowers.forEach(function (f, k) { f.view = flowerView(k); });
    D.bunches.forEach(function (b, i) {
      var f = flowers[b.f], bob = b.c === 'five';
      var col = bob ? cyc(PINKS, (f.n - 1) / 32) : cyc(f.step === 1 ? VIOLETS : BLUES, Math.atan2(f.c[1], f.c[0]) / Math.PI);
      if (b.c === 'star') col.offsetHSL(0, 0, 0.03);
      var mat = Yarn.material(col, TEX);
      var y = Yarn.bunch(b, f.view.n, i);
      var mesh = new THREE.Mesh(y.geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false; world.add(mesh);
      var mid = vec(b.p[Math.floor(b.p.length / 2)]);
      objs.push({ mesh: mesh, mat: mat, f: b.f, c: b.c, rank: rank[i], last: -1, base: col, mid: mid, steps: y.steps });
    });

    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(D.surface, 3)); sg.computeVertexNormals();
    surf = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
    world.add(surf);
    dbl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(D.double.map(vec)),
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9 }));
    dbl.visible = false; world.add(dbl);

    var F = D.focus;
    [F.flower].concat(F.band, F.meets).forEach(function (k) { focusSet[k] = 1; });
    F.petals.forEach(function (i) { petalSet[i] = 1; });
    // close-up: look straight at the crossing, between the two sheets
    var pm = new V3(); F.petals.forEach(function (i) { pm.add(objs[i].mid); }); pm.multiplyScalar(1 / F.petals.length);
    var n1 = flowers[F.flower].view.n, n2 = flowers[F.band[0]].view.n.clone();
    if (n2.dot(n1) < 0) n2.negate();
    var vdir = n1.clone().add(n2).normalize();
    if (vdir.dot(new V3(pm.x, pm.y, 0).normalize()) < -0.3) vdir.negate();
    CLOSE = { tgt: pm, pos: pm.clone().add(vdir.multiplyScalar(6.5)) };

    labelDefs = [
      { k: F.flower, text: '9', cls: 'new' },
      { k: F.meets[0], text: String(flowers[F.meets[0]].n), cls: 'old' },
      { k: F.meets[1], text: String(flowers[F.meets[1]].n), cls: 'old' },
      { k: F.band[0], text: L().band, cls: 'band' },
      { k: F.band[1], text: L().band, cls: 'band' }
    ];
    labelDefs.forEach(function (d) { d.el = document.createElement('span'); d.el.className = d.cls; d.el.textContent = d.text; labelsEl.appendChild(d.el); });
    document.getElementById('loading').remove();
  }
  var CLOSE;

  // the flower the camera follows: the latest one that has started
  function currentFlower(tt) {
    var best = -1, bs = -1;
    flowers.forEach(function (f, k) { var s = sched(f)[0]; if (s <= tt + 0.6 && s > bs) { bs = s; best = k; } });
    return best;
  }

  // ---------- per-frame state ----------
  var camGoal = { pos: new V3(), tgt: new V3() }, focusPt = new V3();
  // The camera glides around the cowl's centre (azimuth, elevation, distance) with capped speeds,
  // so a far move takes a slow arc instead of a sudden swing.
  var cs = null, tgtCur = new V3(), wasAuto = false;
  var MAX_AZ = 0.22, MAX_EL = 0.15, MAX_R = 1.8, MAX_T = 1.2, EASE = 0.6, WIDE = 21;
  var held = null;   // current wide shot {az, el, t}; replaced only when the working flower can't be seen
  function shotTgt(h) { return new V3(0, 0, 0); }
  function shotPos(h) { return new V3(Math.cos(h.el) * Math.cos(h.az), Math.cos(h.el) * Math.sin(h.az), Math.sin(h.el)).multiplyScalar(WIDE); }
  // in frame (within ~14 degrees of the view axis) and fewer than 6 grown bunches on the line of sight
  function seen(c, cp, tg) {
    var toC = c.clone().sub(cp), dC = toC.length(), axis = tg.clone().sub(cp).normalize();
    if (toC.clone().normalize().dot(axis) < Math.cos(0.25)) return false;
    toC.normalize();
    var hits = 0, m = new V3();
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i]; if (!o.mesh.visible) continue;
      m.copy(o.mid).applyMatrix4(world.matrixWorld).sub(cp);
      var along = m.dot(toC); if (along < 0.5 || along > dC - 0.8) continue;
      if (m.addScaledVector(toC, -along).length() < 0.3 && ++hits >= 6) return false;
    }
    return true;
  }
  function sph(p) { var r = p.length() || 1; return { az: Math.atan2(p.y, p.x), el: Math.asin(Math.max(-1, Math.min(1, p.z / r))), r: r }; }
  function cap(x, m) { return x > m ? m : x < -m ? -m : x; }
  function moveCam(dt) {
    var g = sph(camGoal.pos);
    if (!dt || !cs) { cs = g; tgtCur.copy(camGoal.tgt); }
    else {
      if (!wasAuto) { cs = sph(camera.position); tgtCur.copy(controls.target); }
      var k = 1 - Math.exp(-dt * EASE);
      var daz = Math.atan2(Math.sin(g.az - cs.az), Math.cos(g.az - cs.az));
      cs.az += cap(daz * k, MAX_AZ * dt); cs.el += cap((g.el - cs.el) * k, MAX_EL * dt); cs.r += cap((g.r - cs.r) * k, MAX_R * dt);
      var step = camGoal.tgt.clone().sub(tgtCur).multiplyScalar(k);
      if (step.length() > MAX_T * dt) step.setLength(MAX_T * dt);
      tgtCur.add(step);
    }
    var ce = Math.cos(cs.el);
    camera.position.set(cs.r * ce * Math.cos(cs.az), cs.r * ce * Math.sin(cs.az), cs.r * Math.sin(cs.el));
    controls.target.copy(tgtCur);
  }
  function apply(tt, dt) {
    var autoCam = autoOn(), w = focusW(tt), si = segAt(tt), follow = autoCam && si !== 3 && si !== 5;
    world.updateMatrixWorld();

    // camera goal
    if (follow) {
      var k = Math.max(0, currentFlower(tt));          // before the first flower starts, frame flower 1
      {
        // Wide shot of the whole cowl. The camera stays where it is as long as the flower being worked
        // is in frame and not badly hidden; only then does it turn (slowly) to a better side.
        var fv = flowers[k].view, c = fv.c.clone().applyMatrix4(world.matrixWorld);
        var keep = !!(held && dt) && ((tt >= held.t && tt - held.t < 5) || seen(c, shotPos(held), shotTgt(held)));
        if (!keep) {
          var n = fv.n.clone().transformDirection(world.matrixWorld), inner = n.x * c.x + n.y * c.y < 0;
          held = { az: Math.atan2(c.y, c.x) + (inner ? Math.PI : 0), el: inner ? 0.95 : (n.z >= 0 ? 0.55 : -0.35), t: tt };
          if (!dt) held.t = -Infinity;
        }
        camGoal.tgt.copy(shotTgt(held)); camGoal.pos.copy(shotPos(held));
        focusPt.copy(c);
      }
    } else if (si === 3) {
      var cl = CLOSE.pos.clone().applyMatrix4(world.matrixWorld), ct = CLOSE.tgt.clone().applyMatrix4(world.matrixWorld);
      camGoal.pos.copy(cl); camGoal.tgt.copy(ct); focusPt.copy(ct);
    }
    if (autoCam && si !== 5) moveCam(dt);
    wasAuto = autoCam && si !== 5;

    // cut-away (close-up of flower 9 only): fade what sits between the camera and the crossing
    var cam = camera.position, dF = cam.distanceTo(focusPt), toF = focusPt.clone().sub(cam).normalize();
    var cut = si === 3 && autoCam, tmp = new V3(), sm = dt ? 1 - Math.exp(-dt * 3) : 1;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i], f = flowers[o.f], g = growth(f, tt), fr;
      if (o.c === 'rim') { var j = o.rank[0], n = o.rank[1]; fr = clamp((g - 0.45 - 0.5 * j / n) / (1.1 / n + 0.02)); }
      else fr = f.step === 2 ? g : clamp(g / 0.45);
      var cnt = o.steps[Math.round(fr * GM)];
      if (cnt !== o.last) { o.mesh.geometry.setDrawRange(0, cnt); o.mesh.visible = cnt > 0; o.last = cnt; }
      if (!o.mesh.visible) continue;
      var op = 1;
      if (cut) {
        tmp.copy(o.mid).applyMatrix4(world.matrixWorld);
        var d = cam.distanceTo(tmp), cone = ease((tmp.sub(cam).normalize().dot(toF) - 0.75) / 0.15);
        op = 1 - 0.85 * cone * ease((dF - 0.9 - d) / 0.8);
      }
      var dim = focusSet[o.f] ? 0 : w;
      op = Math.min(op, 1 - 0.96 * dim);
      o.op = o.op == null ? op : o.op + (op - o.op) * sm;          // ease every opacity change
      o.mat.opacity = o.op; o.mat.depthWrite = o.op > 0.6; o.mesh.castShadow = o.op > 0.5;
      o.mat.color.copy(o.base).lerp(GREY, 0.8 * dim);
      if (petalSet[i]) { o.mat.color.lerp(GOLD, w); o.mat.emissive.copy(GOLD).multiplyScalar(0.55 * w); }
      else if (f.step === 3 && f.n === 9) o.mat.emissive.copy(GOLD).multiplyScalar(0.05 * w);
      else if (g > 0 && g < 1 && f.step !== 2) o.mat.emissive.setRGB(0.05, 0.06, 0.09);   // the flower being worked
      else o.mat.emissive.setRGB(0, 0, 0);
    }
    if (surf) surf.material.opacity = 0.035 * (1 - 0.8 * w);

    stepEls.forEach(function (el, k2) { el.classList.toggle('on', k2 === si); });
    var cap = L().CAP[si];
    if (captionEl.textContent !== cap) captionEl.textContent = cap;
    var sub = subAt(tt);
    if (tt >= T && !userMoved) sub = L().hint;   // at the end, invite the viewer to take over the camera
    if (si === 1) {
      var done = 0; flowers.forEach(function (f2) { if (f2.step === 2 && growth(f2, tt) > 0.5) done++; });
      if (done > 0 && done < 32) sub += L().count(done, done <= 16 ? 1 : 2);
    }
    if (subEl.textContent !== sub) { subEl.textContent = sub; subEl.classList.toggle('on', !!sub); }
    labelDefs.forEach(function (d) { d.on = w > 0.4; d.el.style.display = d.on ? 'block' : 'none'; });
  }

  function placeLabels() {
    var r = viewer.getBoundingClientRect(), v = new V3();
    labelDefs.forEach(function (d) {
      if (!d.on) return;
      v.copy(flowers[d.k].view.c).applyMatrix4(world.matrixWorld).project(camera);
      d.el.style.left = ((v.x + 1) / 2 * r.width) + 'px'; d.el.style.top = ((1 - v.y) / 2 * r.height) + 'px';
    });
  }

  function setView(name) { var v = VIEWS[name]; camera.position.set(v[0], v[1], v[2]); controls.target.set(0, 0, 0); controls.update(); }
  setView('oblique');
  function resize() {
    var w = viewer.clientWidth, h = viewer.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function frame(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    if (playing && D) {
      t += dt * rate;
      if (t >= T) { t = T; playing = false; playBtn.textContent = L().replay; }
      scrub.value = Math.round(t / T * 1000);
    }
    if (D) {
      if (segAt(t) === 5 && document.getElementById('tSpin').checked) world.rotation.z += dt * 0.15;
      apply(t, dt);
    }
    controls.enabled = !playing; cv.style.cursor = playing ? 'default' : 'grab';
    controls.update(); placeKey();
    renderer.render(scene, camera);
    placeLabels();
    requestAnimationFrame(frame);
  }

  // ---------- UI ----------
  function jump(tt, play) {
    t = tt; scrub.value = Math.round(t / T * 1000); userMoved = false; held = null;
    playing = play; playBtn.textContent = play ? L().pause : L().play;
    if (segAt(t) !== 5) world.rotation.z = 0;
    if (D) apply(t, 0);
  }
  playBtn.addEventListener('click', function () {
    if (!D) return;
    if (t >= T) { jump(0, true); return; }
    playing = !playing; if (playing) userMoved = false; playBtn.textContent = playing ? L().pause : L().play;
  });
  scrub.addEventListener('input', function () { jump(scrub.value / 1000 * T, false); });
  stepEls.forEach(function (el) {
    el.addEventListener('click', function () { var k = +el.getAttribute('data-seg'); jump(SEG[k][0] + 0.001, true); });
  });
  document.getElementById('rate').addEventListener('change', function (e) { rate = +e.target.value; });
  controls.addEventListener('start', function () { userMoved = true; });
  document.getElementById('tSurf').addEventListener('change', function (e) { if (surf) surf.visible = e.target.checked; });
  document.getElementById('tDbl').addEventListener('change', function (e) { if (dbl) dbl.visible = e.target.checked; });
  Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (b) {
    b.addEventListener('click', function () {
      playing = false; playBtn.textContent = t >= T ? L().replay : L().play;
      userMoved = true; setView(b.getAttribute('data-view'));
    });
  });

  resize();
  requestAnimationFrame(frame);
  applyLang();
  if (window.TIDINGS_DATA) {
    D = window.TIDINGS_DATA; build();
    var m = /t=([\d.]+)/.exec(location.hash);          // #t=30 opens paused at that moment
    if (m) jump(Math.min(T, +m[1]), false); else jump(0, true);
  } else document.getElementById('loading').textContent = L().loadFail;
})();
