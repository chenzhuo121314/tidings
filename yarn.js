// Thread-level geometry for the two stitches of the piece.
// Every bunch becomes a handful of yarn tubes laid along its centre line on the surface:
//   jasmine stitch: 7 strands along the meridians of a flattened spindle, gathered at both ends;
//   bobble stitch: 3 unfinished trebles, each a straight loop (2 strands) with 2 wraps around its middle,
//                  bulging to the front and closed together at the centre of the five-petal flower.
// The ply twist is a repeating bump texture; occlusion between strands is baked into vertex colours.
window.Yarn = (function () {
  'use strict';
  var V3 = THREE.Vector3;
  var RT = 0.036;            // thread radius (a bunch is about 1 unit long)
  var SIDES = 6;             // facets around a thread
  var DETAIL = 1;            // sampling density along threads (lower on small screens)
  var NPLY = 4, PITCH = 7.5 * RT;
  var M = 24;                // growth steps along a bunch

  function rng(seed) {
    var s = (seed * 2654435761 >>> 0) || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  }
  function smooth(a, b, x) { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

  // ---------- ply texture: rounded lobes with a groove between neighbours, fibres along the twist ----------
  function textures(maxAniso) {
    var N = 256, ca = document.createElement('canvas'), cb = document.createElement('canvas');
    ca.width = ca.height = cb.width = cb.height = N;
    var ga = ca.getContext('2d'), gb = cb.getContext('2d'), ia = ga.createImageData(N, N), ib = gb.createImageData(N, N);
    var FIB = 48, hash = [];
    var r = rng(7); for (var k = 0; k < FIB; k++) hash.push(r());
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var X = x / N, Y = y / N, chi = NPLY * (X - Y);
      var hgt = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * chi), 0.8);
      var fb = (X - Y) * FIB, fi = ((Math.floor(fb) % FIB) + FIB) % FIB;
      var micro = 0.95 + 0.07 * hash[fi];
      var alb = (0.86 + 0.14 * Math.pow(hgt, 0.45)) * micro;
      var o = 4 * (y * N + x);
      ia.data[o] = ia.data[o + 1] = ia.data[o + 2] = Math.round(255 * Math.min(1, alb)); ia.data[o + 3] = 255;
      var h = hgt * (0.92 + 0.08 * hash[fi]);
      ib.data[o] = ib.data[o + 1] = ib.data[o + 2] = Math.round(255 * h); ib.data[o + 3] = 255;
    }
    ga.putImageData(ia, 0, 0); gb.putImageData(ib, 0, 0);
    function tex(c) {
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso || 1);
      return t;
    }
    return { map: tex(ca), bump: tex(cb) };
  }

  // ---------- the bunch centre line with the surface normal carried along ----------
  function Axis(b) {
    this.curve = new THREE.CatmullRomCurve3(b.p.map(function (p) { return new V3(p[0], p[1], p[2]); }));
    this.ns = b.n.map(function (p) { return new V3(p[0], p[1], p[2]); });
  }
  Axis.prototype.frame = function (u) {
    var p = this.curve.getPoint(u), t = this.curve.getTangent(u).normalize();
    var x = u * (this.ns.length - 1), i = Math.min(this.ns.length - 2, Math.floor(x)), f = x - i;
    var n = this.ns[i].clone().lerp(this.ns[i + 1], f);
    n.addScaledVector(t, -n.dot(t)).normalize();
    return { p: p, t: t, n: n, b: new V3().crossVectors(t, n) };
  };

  // ---------- tubes ----------
  function Builder() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.tri = []; this.key = []; this.nv = 0; }
  // P: thread centre points; RN: reference normals; K: growth key per point (0..1);
  // tone: brightness per point; C: optional bundle centre per point (inward faces darken); RS: optional radius scale
  Builder.prototype.tube = function (P, RN, K, tone, C, RS) {
    var n = P.length, s = 0, base = this.nv, T = new V3(), N = new V3(), B = new V3(), d = new V3(), out = new V3();
    for (var i = 0; i < n; i++) {
      T.copy(P[Math.min(i + 1, n - 1)]).sub(P[Math.max(i - 1, 0)]).normalize();
      if (i) s += P[i].distanceTo(P[i - 1]);
      N.copy(RN[i]).addScaledVector(T, -RN[i].dot(T));
      if (N.lengthSq() < 1e-8) N.set(T.y, -T.x, 0.3);
      N.normalize(); B.crossVectors(T, N);
      var r = RT * (RS ? RS[i] : 1) * (i === 0 || i === n - 1 ? 0.55 : 1), dc = 0;
      if (C) { out.copy(P[i]).sub(C[i]); dc = out.length(); out.multiplyScalar(1 / Math.max(dc, RT)); }
      for (var j = 0; j <= SIDES; j++) {
        var a = 2 * Math.PI * j / SIDES;
        d.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        this.pos.push(P[i].x + d.x * r, P[i].y + d.y * r, P[i].z + d.z * r);
        this.nrm.push(d.x, d.y, d.z);
        this.uv.push(j / SIDES, s / PITCH);
        var ao = C ? 0.45 + 0.55 * smooth(-0.4, 0.85, d.dot(out)) : 1, g = tone[i] * ao;
        this.col.push(g, g, g);
      }
    }
    for (i = 0; i < n - 1; i++) for (j = 0; j < SIDES; j++) {
      var a0 = base + i * (SIDES + 1) + j, b0 = a0 + SIDES + 1;
      this.tri.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      var kk = (K[i] + K[i + 1]) / 2; this.key.push(kk, kk);
    }
    this.nv += n * (SIDES + 1);
  };
  Builder.prototype.geometry = function () {
    var nt = this.key.length, ord = new Array(nt), key = this.key, tri = this.tri;
    for (var i = 0; i < nt; i++) ord[i] = i;
    ord.sort(function (a, b) { return key[a] - key[b]; });
    var idx = this.nv > 65535 ? new Uint32Array(nt * 3) : new Uint16Array(nt * 3), steps = new Int32Array(M + 1), k = 0;
    for (i = 0; i < nt; i++) {
      var t = ord[i];
      while (k <= M && key[t] > k / M + 1e-6) steps[k++] = i * 3;
      idx[3 * i] = tri[3 * t]; idx[3 * i + 1] = tri[3 * t + 1]; idx[3 * i + 2] = tri[3 * t + 2];
    }
    while (k <= M) steps[k++] = nt * 3;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return { geo: g, steps: steps };
  };

  function frames(ax, m) { var F = []; for (var i = 0; i < m; i++) F.push(ax.frame(i / (m - 1))); return F; }

  // half-width allowed near an end whose neighbours sit `ang` radians away, so bunches meeting at a vertex don't overlap
  function wedge(sv, len, ang) { var k = Math.tan(ang / 2); return Math.min(0.92 * sv * k + 0.012, 0.92 * (len - sv) * k + 0.012); }
  var E0 = 0.035;            // bunches stop just short of the vertex

  // ---------- jasmine stitch: 7 strands round a spindle ----------
  function jasmine(Bd, ax, r) {
    var K = 7, m = Math.round(17 * DETAIL), Rb = 0.13, tw = 0.35, len = ax.curve.getLength(), F = [], T = [], WB = [], WN = [];
    for (var i = 0; i < m; i++) {
      var tau = E0 + (1 - 2 * E0) * i / (m - 1), rho = 0.02 + (Rb - 0.02) * Math.pow(Math.sin(Math.PI * tau), 0.7);
      var wb = Math.min(rho, wedge(tau * len, len, Math.PI / 4));
      F.push(ax.frame(tau)); T.push(tau); WB.push(wb); WN.push(0.75 * Math.min(rho * rho / Math.max(wb, 1e-3), 1.45 * rho));
    }
    var ph0 = r() * 6.283;
    for (var k = 0; k < K; k++) {
      var P = [], RN = [], TN = [], C = [], sc = 0.9 + 0.16 * r(), jit = 0.9 + 0.16 * r();
      var f1 = 0.5 + 0.6 * r(), p1 = r(), f2 = 0.8 + 0.8 * r(), p2 = r(), ph = ph0 + 2 * Math.PI * k / K + 0.16 * (r() - 0.5);
      for (i = 0; i < m; i++) {
        var t = T[i], w = Math.sin(Math.PI * t), f = F[i];
        var phi = ph + tw * (t - 0.5) + 0.16 * w * Math.sin(2 * Math.PI * (t * f1 + p1));
        var wig = sc * (1 + 0.06 * Math.sin(2 * Math.PI * (t * f2 + p2)));
        P.push(f.p.clone().addScaledVector(f.n, WN[i] * wig * Math.cos(phi)).addScaledVector(f.b, WB[i] * wig * Math.sin(phi)));
        RN.push(f.n); C.push(f.p); TN.push(jit * (0.6 + 0.4 * Math.pow(w, 0.5)));
      }
      Bd.tube(P, RN, T, TN, C);
    }
  }

  // ---------- bobble stitch: 3 unfinished trebles, fanned side by side and closed together ----------
  // The bunch starts at the five-petal centre, where the bobbles close; the posts leave their base eye side by side,
  // fan out in a row that buckles toward the front, and each post (the pulled-up loop and its yarn-overs, two equal
  // strands) runs straight at the base, twists twice in the middle and runs straight into the closing at the top.
  function bobble(Bd, ax, front, r) {
    var NP = 3, m = Math.round(38 * DETAIL), turns = 2, rs = RT, postR = 1.9 * rs, sLat = 1.5 * postR, PLAIN = [0.32, 0.16];
    var len = ax.curve.getLength(), F = [], T = [], G = [], TAP = [], SQ = [], DEP = [];
    var mid = ax.frame(0.5), sgn = mid.n.dot(front) < 0 ? -1 : 1;
    for (var i = 0; i < m; i++) {
      var tau = E0 + (1 - 2 * E0) * i / (m - 1), f = ax.frame(tau);
      if (sgn < 0) { f.n.negate(); f.b.negate(); }
      var g = Math.pow(Math.sin(Math.PI * tau), 0.55), tap = 0.5 + 0.5 * Math.pow(g, 0.6);
      var want = sLat * g + postR * tap, sq = Math.min(1, wedge(tau * len, len, 2 * Math.PI / 5) * 1.3 / Math.max(want, 1e-6));
      F.push(f); T.push(tau); G.push(g); TAP.push(tap); SQ.push(sq); DEP.push(2.4 * postR * g * (1 + 1.3 * (1 - sq)));
    }
    var hub = F.map(function (f, i) { return f.p.clone().addScaledVector(f.n, 0.3 * DEP[i]); });
    for (var k = 0; k < NP; k++) {
      var kk = k - (NP - 1) / 2, shell = 1 - Math.pow(kk / ((NP - 1) / 2 + 0.6), 2), core = [], arc = [0];
      for (i = 0; i < m; i++) {
        core.push(F[i].p.clone().addScaledVector(F[i].b, kk * sLat * G[i] * SQ[i]).addScaledVector(F[i].n, DEP[i] * (shell - 0.4)));
        if (i) arc.push(arc[i - 1] + core[i].distanceTo(core[i - 1]));
      }
      var jit = 0.94 + 0.1 * r(), dj = 0.24 * (r() - 0.5), ts = new V3();
      for (var j = 0; j < 2; j++) {
        var P = [], RN = [], TN = [], RS = [];
        for (i = 0; i < m; i++) {
          ts.copy(core[Math.min(i + 1, m - 1)]).sub(core[Math.max(i - 1, 0)]).normalize();
          var er = F[i].n.clone().addScaledVector(F[i].b, 0.55 * kk);
          er.addScaledVector(ts, -er.dot(ts)).normalize();
          var et = new V3().crossVectors(ts, er);
          var an = 1 - arc[i] / arc[m - 1], u = Math.min(1, Math.max(0, (an - PLAIN[0]) / (1 - PLAIN[0] - PLAIN[1])));
          u -= 0.35 * Math.sin(2 * Math.PI * u) / (2 * Math.PI);
          var a = 2 * Math.PI * turns * u + dj + Math.PI * j, o = 0.9 * rs * TAP[i];
          P.push(core[i].clone().addScaledVector(et, o * Math.cos(a)).addScaledVector(er, o * Math.sin(a)));
          RN.push(er); RS.push(TAP[i]); TN.push(jit * (0.6 + 0.4 * Math.pow(Math.sin(Math.PI * T[i]), 0.5)));
        }
        Bd.tube(P, RN, T, TN, hub, RS);
      }
    }
    // the closing loop drawn through all the posts at the top
    var iq = Math.round(0.075 / (1 - 2 * E0) * (m - 1)), fq = F[iq], hw = (NP - 1) / 2 * sLat * G[iq] * SQ[iq] + 0.8 * postR * TAP[iq];
    var rad = Math.max(0.8 * hw, 1.5 * rs), nq = Math.round(22 * DETAIL), Q = [], QN = [], QK = [], QT = [], QC = [], QR = [], ph = r() * 6.283;
    for (i = 0; i < nq; i++) {
      var s2 = i / (nq - 1), a2 = 2 * Math.PI * 1.25 * s2 + ph, c2 = fq.p.clone().addScaledVector(fq.t, (s2 - 0.5) * 0.5 * rs);
      Q.push(c2.clone().addScaledVector(fq.n, rad * Math.cos(a2)).addScaledVector(fq.b, rad * Math.sin(a2)));
      QN.push(fq.n); QK.push(T[iq]); QT.push(0.85); QC.push(c2); QR.push(0.85);
    }
    Bd.tube(Q, QN, QK, QT, QC, QR);
  }

  // b: one bunch from TIDINGS_DATA; front: the side a bobble bulges to; seed: any integer
  function bunch(b, front, seed) {
    var Bd = new Builder(), ax = new Axis(b), r = rng(seed + 1);
    if (b.c === 'five') bobble(Bd, ax, front, r); else jasmine(Bd, ax, r);
    return Bd.geometry();
  }

  // one material per bunch, so the animation can tint and fade bunches one by one
  function material(col, tex) {
    return new THREE.MeshPhysicalMaterial({
      color: col.clone(), map: tex.map, bumpMap: tex.bump, bumpScale: 0.0035, vertexColors: true,
      roughness: 0.9, metalness: 0, specularIntensity: 0.35,
      sheen: 1, sheenRoughness: 0.45, sheenColor: col.clone().lerp(new THREE.Color(1, 1, 1), 0.25).multiplyScalar(0.35),
      envMapIntensity: 0.55, transparent: true });
  }

  function lowDetail() { SIDES = 5; DETAIL = 0.7; }

  return { M: M, RT: RT, textures: textures, bunch: bunch, material: material, lowDetail: lowDetail };
})();
