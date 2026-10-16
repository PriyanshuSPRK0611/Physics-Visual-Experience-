/* ============================================================================
   Rutherford's Gold Foil Experiment — interactive simulation
   ----------------------------------------------------------------------------
   Physics
   -------
   An alpha particle (charge +2e) approaches a gold nucleus (charge +Ze).
   The Coulomb repulsion  F = k·(2e)(Ze)/r²  bends the path into a hyperbola.

   With the "collision radius"  r0' = k·(2e)(Ze) / (2E)   [E = kinetic energy]
   the scattering angle obeys the exact Rutherford relation

        tan(θ/2) = r0' / b                     (b = impact parameter)

   and the total cross-section for scattering beyond θ is

        σ(>θ) = π·r0'²·cot²(θ/2)

   The probability that one alpha is deflected past θ while crossing the foil is
   σ(>θ) × (atoms per unit area) = σ(>θ)·n·t.   These are the numbers this file
   actually computes — nothing on screen is scripted.

   The microscopic trajectories (zoom view) are integrated with RK4 in the
   dimensionless system where length is measured in r0' and speed in units of
   the incoming speed v0; there the equation of motion reduces to
        d²x/dτ² = x̂ / x²                        (verified against tan θ/2 = r0'/b)
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ constants */
  var E0 = 1.602176634e-19;      // elementary charge (C)
  var K  = 8.9875517923e9;       // Coulomb constant (N·m²/C²)
  var ZA = 2;                    // alpha charge number
  var NA = 6.02214076e23;        // Avogadro
  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;

  var MAT = {
    gold:      { Z: 79, A: 197.0, rho: 19300, name: 'Gold' },
    silver:    { Z: 47, A: 107.9, rho: 10490, name: 'Silver' },
    copper:    { Z: 29, A: 63.5,  rho: 8960,  name: 'Copper' },
    aluminium: { Z: 13, A: 27.0,  rho: 2700,  name: 'Aluminium' }
  };

  var NBINS = 18;                // histogram: 18 bins of 10°

  /* ------------------------------------------------------------------- state */
  var S = {
    material: 'gold',
    energyMeV: 5,
    thicknessUm: 0.4,
    rate: 2e4,                   // alpha particles per second (simulated)
    detAngle: 60,
    showPaths: true,
    showImpact: false,
    zoom: false,
    logHist: true,
    paused: false
  };

  /* --------------------------------------------------------------- derived physics */
  var P = {};
  function derive() {
    var m = MAT[S.material];
    var E = S.energyMeV * 1e6 * E0;                 // joules
    var r0p = K * ZA * m.Z * E0 * E0 / (2 * E);     // collision radius (m)
    var n = (m.rho * 1000 / m.A) * NA;              // atoms per m³ (A in g/mol → kg)
    var areal = n * S.thicknessUm * 1e-6;           // atoms per m²
    P = {
      Z: m.Z, E: E, r0p: r0p, n: n, areal: areal,
      closest: 2 * r0p
    };
    P.sigmaGt = function (th) {                     // m², θ in radians
      var t = Math.tan(th / 2);
      return Math.PI * r0p * r0p / (t * t);
    };
    P.probGt = function (th) {                      // 0..1
      return Math.min(1, P.sigmaGt(th) * areal);
    };
  }

  /* ------------------------------------------------------------- measurements */
  var emitted = 0;             // cumulative alphas (float)
  var count90 = 0;             // cumulative deflected past 90°
  var detCount = 0;            // cumulative at the detector angle
  var hist = new Float64Array(NBINS);
  var logAt = 0;               // throttle for observation log

  /* ------------------------------------------------------------- visuals */
  var parts = [];              // apparatus particles
  var flashes = [];            // scintillation flashes
  var zoomParts = [];          // single-nucleus particles
  var zoomSpawnT = 0;

  /* ================================================================ canvas setup */
  var canvas = document.getElementById('stageCanvas');
  var ctx = canvas.getContext('2d');
  var histCanvas = document.getElementById('histCanvas');
  var hctx = histCanvas.getContext('2d');
  var W = 1000, H = 560, HW = 900, HH = 280, dpr = 1;

  function fit() {
    var stage = document.getElementById('stage');
    var rect = stage.getBoundingClientRect();
    W = Math.max(320, Math.floor(rect.width));
    H = Math.round(W * 0.56);
    if (H > 640) H = 640;
    if (H < 380) H = 380;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var box = histCanvas.parentElement.getBoundingClientRect();
    HW = Math.max(260, Math.floor(box.width - 36));
    HH = Math.max(200, Math.min(330, Math.round(HW * 0.4)));
    histCanvas.width = Math.round(HW * dpr);
    histCanvas.height = Math.round(HH * dpr);
    histCanvas.style.height = HH + 'px';
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ================================================================== helpers */
  function roundRect(c, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function fmtInt(n) { return Math.round(n).toLocaleString('en-IN'); }

  function fmtProb(p) {
    if (p <= 0) return '—';
    return '1 in ' + fmtInt(1 / p);
  }

  // Poisson sample — exact (Knuth) for small means, normal approx for large.
  function poisson(mean) {
    if (mean <= 0) return 0;
    if (mean < 30) {
      var L = Math.exp(-mean), k = 0, p = 1;
      do { k++; p *= Math.random(); } while (p > L);
      return k - 1;
    }
    var g = 0;
    for (var i = 0; i < 6; i++) g += Math.random();
    g = (g - 3) / 0.70710678;
    return Math.max(0, Math.round(mean + g * Math.sqrt(mean)));
  }

  // Probability mass in an angular bin [a,b] (radians).
  function binMass(a, b) {
    if (a <= 1e-6) return 1 - P.probGt(b);   // bin 0 holds everything below b
    return Math.max(0, P.probGt(a) - P.probGt(b));
  }

  // Sample θ from the conditional Rutherford density given θ > θmin.
  function sampleThetaAbove(thMin) {
    var c = 1 / Math.tan(thMin / 2);
    var u = Math.random();                    // 0..1
    var cot = c * Math.sqrt(u);               // cot(θ/2) shrinks toward 0 → θ → π
    if (cot < 1e-9) return Math.PI - 1e-6;
    return 2 * Math.atan(1 / cot);
  }

  /* ============================================ RK4 integration (scaled units) */
  // d²x/dτ² = x̂ / x²  , length unit = r0', speed unit = v0
  function rk4step(x, y, vx, vy, dt) {
    var r2 = x * x + y * y, r = Math.sqrt(r2), r3 = r2 * r;
    var ax = x / r3, ay = y / r3;
    var k1x = vx, k1y = vy, k1vx = ax, k1vy = ay;

    var x2 = x + 0.5 * dt * k1x, y2 = y + 0.5 * dt * k1y;
    var vx2 = vx + 0.5 * dt * k1vx, vy2 = vy + 0.5 * dt * k1vy;
    r2 = x2 * x2 + y2 * y2; r = Math.sqrt(r2); r3 = r2 * r;
    var k2x = vx2, k2y = vy2, k2vx = x2 / r3, k2vy = y2 / r3;

    var x3 = x + 0.5 * dt * k2x, y3 = y + 0.5 * dt * k2y;
    var vx3 = vx + 0.5 * dt * k2vx, vy3 = vy + 0.5 * dt * k2vy;
    r2 = x3 * x3 + y3 * y3; r = Math.sqrt(r2); r3 = r2 * r;
    var k3x = vx3, k3y = vy3, k3vx = x3 / r3, k3vy = y3 / r3;

    var x4 = x + dt * k3x, y4 = y + dt * k3y;
    var vx4 = vx + dt * k3vx, vy4 = vy + dt * k3vy;
    r2 = x4 * x4 + y4 * y4; r = Math.sqrt(r2); r3 = r2 * r;
    var k4x = vx4, k4y = vy4, k4vx = x4 / r3, k4vy = y4 / r3;

    return [
      x + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x),
      y + dt / 6 * (k1y + 2 * k2y + 2 * k3y + k4y),
      vx + dt / 6 * (k1vx + 2 * k2vx + 2 * k3vx + k4vx),
      vy + dt / 6 * (k1vy + 2 * k2vy + 2 * k3vy + k4vy)
    ];
  }

  function computePath(b) {                 // b in units of r0'
    var X0 = 8.5, x = -9.2, y = b, vx = 1, vy = 0;
    var pts = [{ x: x, y: y }], steps = 0;
    while (steps < 40000) {
      var r = Math.hypot(x, y);
      var dt = 0.006 * Math.min(1, Math.max(r, 0.06));
      var s = rk4step(x, y, vx, vy, dt);
      x = s[0]; y = s[1]; vx = s[2]; vy = s[3];
      steps++;
      if (steps % 2 === 0) pts.push({ x: x, y: y });
      if (r > X0 && (x * vx + y * vy) > 0) break;
    }
    return { pts: pts, theta: Math.atan2(vy, vx) };
  }

  /* ================================================================== geometry */
  function geo() {
    var cx = 0.5 * W, cy = 0.5 * H;
    var R = Math.min(0.40 * H, 0.44 * W);
    return {
      cx: cx, cy: cy, R: R,
      src: { x: 0.09 * W, y: cy },
      col: { x: 0.235 * W, y: cy },
      foilX: 0.5 * W,
      foilTop: 0.14 * H,
      foilBot: 0.86 * H
    };
  }
  function ringPoint(g, th, side) {
    return { x: g.cx + g.R * Math.cos(th), y: g.cy + side * g.R * Math.sin(th) };
  }

  /* ================================================================== update */
  function update(dt) {
    // flashes always age
    for (var i = flashes.length - 1; i >= 0; i--) {
      flashes[i].age += dt;
      if (flashes[i].age > flashes[i].life) flashes.splice(i, 1);
    }
    // particle motion
    for (var j = parts.length - 1; j >= 0; j--) {
      var pt = parts[j];
      pt.p += dt / pt.dur;
      if (pt.p >= 1) {
        if (pt.type === 'scatter' || pt.type === 'single') {
          var g = geo(), rp = ringPoint(g, pt.th, pt.side);
          flashes.push({ x: rp.x, y: rp.y, age: 0, life: 0.75, big: pt.th > 100 * RAD });
        }
        parts.splice(j, 1);
      }
    }
    if (S.paused) { if (S.zoom) updateZoom(dt); return; }

    /* ---- exact counts (sampled so the histogram grows like real data) ---- */
    var frame = S.rate * dt;
    var sum = 0;
    for (var b = 0; b < NBINS; b++) {
      var a0 = b * 10 * RAD, b0 = (b + 1) * 10 * RAD;
      var n = poisson(frame * binMass(a0, b0));
      hist[b] += n; sum += n;
    }
    emitted += sum;
    count90 += poisson(frame * P.probGt(Math.PI / 2));

    var lo = Math.max(0.0005, (S.detAngle - 5)) * RAD;
    var hi = Math.min(179.999, (S.detAngle + 5)) * RAD;
    detCount += poisson(frame * Math.max(0, P.probGt(lo) - P.probGt(hi)));

    if (S.zoom) { updateZoom(dt); return; }

    /* ---- visual events ---- */
    var thShow = 15 * RAD;
    var nEv = Math.min(40, poisson(frame * P.probGt(thShow)));
    for (var k = 0; k < nEv; k++) {
      var th = sampleThetaAbove(thShow);
      parts.push({ type: 'scatter', th: th, side: Math.random() < 0.5 ? -1 : 1, p: 0, dur: 0.5 + Math.random() * 0.25 });
      // log the remarkable ones (throttled)
      var now = performance.now();
      if (th > 150 * RAD && now - logAt > 1500) {
        logAt = now;
        addLog('α deflected ' + (th * DEG).toFixed(0) + '° — a near head-on encounter', 'hot');
      }
    }
    // keep a visible forward beam
    var nS = Math.max(1, Math.min(6, Math.round(frame / 110)));
    for (var s = 0; s < nS; s++) {
      parts.push({ type: 'straight', p: 0, dur: 0.55 + Math.random() * 0.2, jy: (Math.random() - 0.5) * 6 });
    }
  }

  function updateZoom(dt) {
    if (!S.paused) {
      zoomSpawnT += dt;
      if (zoomSpawnT > 0.28 && zoomParts.length < 26) {
        zoomSpawnT = 0;
        var b = 0.15 + 4.0 * Math.pow(Math.random(), 1.4);   // mostly large b (straight)
        zoomParts.push({ path: computePath(b), frac: 0, speed: 7 + Math.random() * 5, b: b });
      }
    }
    for (var i = zoomParts.length - 1; i >= 0; i--) {
      var z = zoomParts[i];
      if (!S.paused) z.frac += z.speed * dt * 60;
      if (z.frac >= z.path.pts.length - 1) zoomParts.splice(i, 1);
    }
  }

  /* ================================================================== render */
  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    if (S.zoom) drawZoom();
    else { drawApparatus(); drawParticles(); drawFlashes(); }
    drawFrameTicks();
  }

  function drawBackdrop() {
    var g = ctx.createRadialGradient(W * 0.5, H * 0.2, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#0d1526');
    g.addColorStop(1, '#05070c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawFrameTicks() {
    ctx.save();
    ctx.strokeStyle = 'rgba(241,196,83,0.35)';
    ctx.lineWidth = 1.5;
    var m = 12, L = 16;
    var corners = [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]];
    corners.forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c[0] + c[2] * L, c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + c[3] * L);
      ctx.stroke();
    });
    ctx.restore();
  }

  function label(text, x, y, color, align, size) {
    ctx.save();
    ctx.fillStyle = color || 'rgba(150,166,190,0.9)';
    ctx.font = (size || 10.5) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawApparatus() {
    var g = geo();

    // ---- beam guide (faint) ----
    ctx.save();
    ctx.strokeStyle = 'rgba(255,231,155,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]);
    ctx.beginPath(); ctx.moveTo(g.src.x, g.cy); ctx.lineTo(g.foilX, g.cy); ctx.stroke();
    ctx.restore();

    // ---- lead source block ----
    drawLeadBlock(g.src.x - 26, g.cy - 30, 52, 60, 'Ra');
    // radium capsule glow
    ctx.save();
    var cg = ctx.createRadialGradient(g.src.x, g.cy, 0, g.src.x, g.cy, 16);
    cg.addColorStop(0, 'rgba(255,120,90,0.9)');
    cg.addColorStop(1, 'rgba(255,120,90,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(g.src.x, g.cy, 16, 0, 7); ctx.fill();
    ctx.restore();
    label('α source', g.src.x, g.cy + 44, 'rgba(255,150,120,0.9)', 'center');

    // ---- collimator ----
    drawLeadBlock(g.col.x - 8, g.cy - 40, 16, 26, null);
    drawLeadBlock(g.col.x - 8, g.cy + 14, 16, 26, null);
    label('collimator', g.col.x, g.cy - 52, 'rgba(150,166,190,0.85)', 'center');

    // ---- gold foil ----
    var shimmer = (performance.now() / 1000) % 6;
    var fg = ctx.createLinearGradient(g.foilX - 5, 0, g.foilX + 5, 0);
    fg.addColorStop(0, 'rgba(120,88,20,0.5)');
    fg.addColorStop(0.5, 'rgba(241,196,83,0.95)');
    fg.addColorStop(1, 'rgba(120,88,20,0.5)');
    ctx.save();
    ctx.shadowColor = 'rgba(241,196,83,0.55)'; ctx.shadowBlur = 16;
    ctx.fillStyle = fg;
    ctx.fillRect(g.foilX - 2.5, g.foilTop, 5, g.foilBot - g.foilTop);
    ctx.restore();
    // travelling highlight
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var hy = g.foilTop + (g.foilBot - g.foilTop) * ((shimmer % 3) / 3);
    var hg = ctx.createLinearGradient(0, hy - 26, 0, hy + 26);
    hg.addColorStop(0, 'rgba(255,240,190,0)');
    hg.addColorStop(0.5, 'rgba(255,240,190,0.35)');
    hg.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(g.foilX - 3, hy - 26, 6, 52);
    ctx.restore();
    label(MAT[S.material].name + ' foil  ' + S.thicknessUm.toFixed(2) + ' µm  (Z=' + MAT[S.material].Z + ')',
      g.foilX, g.foilTop - 14, 'rgba(241,196,83,0.95)', 'center', 11);

    // ---- fluorescent screen ring ----
    ctx.save();
    ctx.strokeStyle = 'rgba(116,255,176,0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R, 0, 7); ctx.stroke();
    ctx.restore();
    label('fluorescent screen (ZnS)', g.cx, g.cy - g.R - 16, 'rgba(116,255,176,0.7)', 'center', 10.5);
    // angle ticks on the ring
    ctx.save();
    ctx.strokeStyle = 'rgba(116,255,176,0.4)';
    ctx.lineWidth = 1.5;
    [0, 45, 90, 135, 180].forEach(function (a) {
      var th = a * RAD;
      var ux = Math.cos(th), uy = Math.sin(th);
      var px = g.cx + g.R * ux, py = g.cy + g.R * uy;
      ctx.beginPath();
      ctx.moveTo(px + uy * 6, py - ux * 6);
      ctx.lineTo(px - uy * 6, py + ux * 6);
      ctx.stroke();
    });
    ctx.restore();

    // ---- detector arm ----
    var th = S.detAngle * RAD;
    var dp = ringPoint(g, th, 1);
    var dp2 = ringPoint(g, th, -1);
    // drawn on the upper side
    ctx.save();
    ctx.strokeStyle = 'rgba(90,209,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(dp.x, dp.y); ctx.stroke();
    // arm block
    ctx.translate(dp.x, dp.y);
    ctx.rotate(th + Math.PI / 2);
    ctx.fillStyle = 'rgba(20,30,46,0.95)';
    ctx.strokeStyle = 'rgba(90,209,255,0.7)';
    roundRect(ctx, -11, -16, 22, 32, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(90,209,255,0.85)';
    ctx.beginPath(); ctx.arc(0, -6, 3.5, 0, 7); ctx.fill();
    ctx.restore();
    label('detector  ' + S.detAngle + '°', dp.x, dp.y - 26, 'rgba(90,209,255,0.95)', 'center', 11);
    // angle wedge
    ctx.save();
    ctx.strokeStyle = 'rgba(90,209,255,0.25)';
    ctx.beginPath(); ctx.arc(g.cx, g.cy, Math.min(g.R * 0.28, 60), 0, -th, true); ctx.stroke();
    ctx.restore();
    void dp2;
  }

  function drawLeadBlock(x, y, w, h, tag) {
    ctx.save();
    var lg = ctx.createLinearGradient(x, y, x, y + h);
    lg.addColorStop(0, '#2b3547'); lg.addColorStop(1, '#161d29');
    ctx.fillStyle = lg;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x, y, w, h, 4); ctx.fill(); ctx.stroke();
    // hatch
    ctx.save();
    roundRect(ctx, x, y, w, h, 4); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (var i = -h; i < w; i += 6) {
      ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke();
    }
    ctx.restore();
    if (tag) label(tag, x + w / 2, y + h / 2, 'rgba(255,255,255,0.5)', 'center', 11);
    ctx.restore();
  }

  function drawParticles() {
    var g = geo();
    for (var i = 0; i < parts.length; i++) {
      var pt = parts[i], x, y, trail;
      if (pt.type === 'straight') {
        var x0 = g.src.x, x1 = g.cx + g.R;
        x = x0 + (x1 - x0) * pt.p;
        y = g.cy + pt.jy;
        trail = 18;
      } else {
        var rp = ringPoint(g, pt.th, pt.side);
        x = g.cx + (rp.x - g.cx) * pt.p;
        y = g.cy + (rp.y - g.cy) * pt.p;
        trail = 20;
      }
      var dx = x - (pt.type === 'straight' ? g.src.x : g.cx);
      var dy = y - g.cy;
      var L = Math.hypot(dx, dy) || 1;
      var ux = dx / L, uy = dy / L;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // trail
      var tg = ctx.createLinearGradient(x, y, x - ux * trail, y - uy * trail);
      tg.addColorStop(0, 'rgba(255,231,155,0.85)');
      tg.addColorStop(1, 'rgba(255,231,155,0)');
      ctx.strokeStyle = tg; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * trail, y - uy * trail); ctx.stroke();
      // head
      var hg = ctx.createRadialGradient(x, y, 0, x, y, 5);
      hg.addColorStop(0, 'rgba(255,255,235,1)');
      hg.addColorStop(1, 'rgba(255,231,155,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
      ctx.restore();

      if (S.showPaths && pt.type !== 'straight') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,231,155,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
      }
    }
    // forward beam hotspot
    var fp = { x: g.cx + g.R, y: g.cy };
    var pulse = 0.55 + 0.12 * Math.sin(performance.now() / 220);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var bg = ctx.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, 34);
    bg.addColorStop(0, 'rgba(255,236,170,' + pulse + ')');
    bg.addColorStop(0.4, 'rgba(255,200,90,0.25)');
    bg.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(fp.x, fp.y, 34, 0, 7); ctx.fill();
    ctx.restore();
    label('undeflected beam', fp.x, fp.y + 30, 'rgba(255,220,140,0.75)', 'center', 10);

    // impact parameter marker for single shots
    if (S.showImpact && parts.length) {
      // handled in zoom; subtle marker at foil
      ctx.save();
      ctx.strokeStyle = 'rgba(90,209,255,0.5)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(g.foilX - 40, g.cy); ctx.lineTo(g.foilX + 40, g.cy); ctx.stroke();
      ctx.restore();
    }
  }

  function drawFlashes() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < flashes.length; i++) {
      var f = flashes[i];
      var k = 1 - f.age / f.life;
      var rad = (f.big ? 26 : 16) * (0.6 + 0.6 * k);
      var col = f.big ? '255,240,180' : '116,255,176';
      var fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
      fg.addColorStop(0, 'rgba(' + col + ',' + (0.95 * k) + ')');
      fg.addColorStop(0.5, 'rgba(' + col + ',' + (0.28 * k) + ')');
      fg.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- zoom view */
  var fanCache = null;
  function buildFan() {
    var bs = [0.18, 0.3, 0.45, 0.65, 0.9, 1.3, 1.8, 2.5, 3.4, 4.4];
    fanCache = bs.map(function (b) { return { b: b, path: computePath(b) }; });
  }

  function drawZoom() {
    var cx = 0.5 * W, cy = 0.5 * H;
    var ppu = Math.min(0.44 * W / 9.5, 0.40 * H / 4.6);
    function toPx(p) { return { x: cx + p.x * ppu, y: cy - p.y * ppu }; }

    // field rings
    ctx.save();
    for (var k = 1; k <= 5; k++) {
      ctx.strokeStyle = 'rgba(241,196,83,' + (0.14 - k * 0.018) + ')';
      ctx.beginPath(); ctx.arc(cx, cy, k * ppu, 0, 7); ctx.stroke();
    }
    ctx.restore();

    // fan of trajectories
    if (!fanCache) buildFan();
    ctx.save();
    ctx.lineWidth = 1;
    for (var i = 0; i < fanCache.length; i++) {
      var pts = fanCache[i].path.pts;
      ctx.strokeStyle = 'rgba(255,231,155,0.16)';
      ctx.beginPath();
      for (var j = 0; j < pts.length; j++) {
        var q = toPx(pts[j]);
        if (j === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // selected impact parameter
    if (bSel !== null) {
      var sp = computePath(bSel);
      ctx.save();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(90,209,255,0.85)';
      ctx.shadowColor = 'rgba(90,209,255,0.6)'; ctx.shadowBlur = 8;
      ctx.beginPath();
      for (var m = 0; m < sp.pts.length; m++) {
        var q2 = toPx(sp.pts[m]);
        if (m === 0) ctx.moveTo(q2.x, q2.y); else ctx.lineTo(q2.x, q2.y);
      }
      ctx.stroke();
      ctx.restore();
      // b indicator
      var yb = cy - bSel * ppu;
      ctx.save();
      ctx.strokeStyle = 'rgba(90,209,255,0.5)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(cx - 4.6 * ppu, yb); ctx.lineTo(cx, yb); ctx.stroke();
      ctx.restore();
      label('b = ' + bSel.toFixed(2) + " r₀'", cx - 4.6 * ppu, yb - 12, 'rgba(90,209,255,0.95)', 'left', 11);
      var thSel = sp.theta * DEG;
      label('θ = ' + (thSel > 0 ? thSel.toFixed(0) : (180 + thSel).toFixed(0)) + '°',
        cx + 0.9 * ppu, cy - 2.6 * ppu, 'rgba(90,209,255,0.95)', 'left', 12);
    }

    // live particles
    for (var z = 0; z < zoomParts.length; z++) {
      var zp = zoomParts[z], arr = zp.path.pts;
      var idx = Math.min(arr.length - 1, Math.floor(zp.frac));
      var q3 = toPx(arr[idx]);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // short trail
      var back = Math.max(0, idx - 14);
      ctx.strokeStyle = 'rgba(255,231,155,0.5)';
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var t = back; t <= idx; t++) {
        var qt = toPx(arr[t]);
        if (t === back) ctx.moveTo(qt.x, qt.y); else ctx.lineTo(qt.x, qt.y);
      }
      ctx.stroke();
      var hg = ctx.createRadialGradient(q3.x, q3.y, 0, q3.x, q3.y, 6);
      hg.addColorStop(0, 'rgba(255,255,240,1)');
      hg.addColorStop(1, 'rgba(255,231,155,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(q3.x, q3.y, 6, 0, 7); ctx.fill();
      ctx.restore();
    }

    // nucleus
    ctx.save();
    var ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, 3.2 * ppu);
    ng.addColorStop(0, 'rgba(255,244,205,1)');
    ng.addColorStop(0.35, 'rgba(241,196,83,0.9)');
    ng.addColorStop(1, 'rgba(241,196,83,0)');
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.arc(cx, cy, 3.2 * ppu, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(5, 0.42 * ppu), 0, 7); ctx.fill();
    ctx.restore();
    label('gold nucleus  +' + MAT[S.material].Z + 'e', cx, cy + 3.2 * ppu + 14, 'rgba(241,196,83,0.95)', 'center', 11.5);
  }

  /* ================================================================ histogram */
  function drawHistogram() {
    var padL = 54, padR = 16, padT = 16, padB = 34;
    var w = HW - padL - padR, h = HH - padT - padB;
    hctx.clearRect(0, 0, HW, HH);

    var i;
    var expArr = new Float64Array(NBINS);
    var maxC = 0;
    for (i = 0; i < NBINS; i++) {
      expArr[i] = emitted * binMass(i * 10 * RAD, (i + 1) * 10 * RAD);
      if (hist[i] > maxC) maxC = hist[i];
      if (expArr[i] > maxC) maxC = expArr[i];
    }
    if (maxC <= 0) maxC = 1;

    function yOf(v) {
      if (S.logHist) {
        var lv = Math.log10(v + 1), lm = Math.log10(maxC + 1);
        return padT + h - (lv / (lm || 1)) * h;
      }
      return padT + h - (v / maxC) * h;
    }

    // grid
    hctx.save();
    hctx.strokeStyle = 'rgba(255,255,255,0.06)';
    hctx.lineWidth = 1;
    for (i = 0; i <= 4; i++) {
      var y = padT + (h * i / 4);
      hctx.beginPath(); hctx.moveTo(padL, y); hctx.lineTo(padL + w, y); hctx.stroke();
    }
    hctx.restore();

    // bars
    var bw = w / NBINS;
    for (i = 0; i < NBINS; i++) {
      var v = hist[i];
      var bx = padL + i * bw + 2;
      var by = yOf(v);
      var bh = padT + h - by;
      if (bh < 0) bh = 0;
      var grad = hctx.createLinearGradient(0, by, 0, padT + h);
      grad.addColorStop(0, 'rgba(241,196,83,0.95)');
      grad.addColorStop(1, 'rgba(241,196,83,0.25)');
      hctx.fillStyle = grad;
      hctx.fillRect(bx, by, Math.max(1, bw - 4), bh);
    }

    // expected (Rutherford cross-section) overlay
    hctx.save();
    hctx.strokeStyle = 'rgba(90,209,255,0.9)';
    hctx.lineWidth = 1.6;
    hctx.beginPath();
    for (i = 0; i < NBINS; i++) {
      var exx = padL + (i + 0.5) * bw, exy = yOf(expArr[i]);
      if (i === 0) hctx.moveTo(exx, exy); else hctx.lineTo(exx, exy);
    }
    hctx.stroke();
    hctx.fillStyle = 'rgba(90,209,255,0.9)';
    hctx.font = '10px ui-monospace, monospace';
    hctx.textAlign = 'right';
    hctx.fillText('\u2014 expected (Rutherford)', padL + w, padT + 10);
    hctx.restore();

    // axis labels
    hctx.save();
    hctx.fillStyle = 'rgba(144,162,186,0.9)';
    hctx.font = '10.5px ui-monospace, monospace';
    hctx.textAlign = 'center';
    for (i = 0; i <= 6; i++) {
      var a = i * 30;
      hctx.fillText(a + '°', padL + (a / 180) * w, padT + h + 16);
    }
    hctx.textAlign = 'right';
    hctx.fillText(fmtInt(maxC), padL - 8, padT + 6);
    hctx.fillText('0', padL - 8, padT + h + 3);
    hctx.textAlign = 'left';
    hctx.fillText('counts', 6, 12);
    hctx.textAlign = 'right';
    hctx.fillText('scattering angle θ', padL + w, padT - 4);
    hctx.restore();
  }

  /* ================================================================ readouts */
  var el = {};
  ['rEmitted', 'rCount90', 'rRatio', 'rDet', 'rClosest', 'rR0',
   'hudEmitted', 'hudBack', 'hudDet', 'log', 'histModePill', 'stageLabel',
   'energyVal', 'thickVal', 'rateVal', 'detVal', 'materialZ', 'bField', 'bVal', 'impact'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  function refreshReadouts() {
    el.rEmitted.textContent = fmtInt(emitted);
    el.rCount90.textContent = fmtInt(count90);
    el.rRatio.textContent = count90 < 1 ? '—' : '1 in ' + fmtInt(emitted / count90);
    el.rDet.textContent = fmtInt(detCount);
    el.rClosest.textContent = (P.closest * 1e15).toFixed(1) + ' fm';
    el.rR0.textContent = (P.r0p * 1e15).toFixed(2) + ' fm';

    el.hudEmitted.innerHTML = 'α emitted&nbsp; <b>' + fmtInt(emitted) + '</b>';
    el.hudBack.innerHTML = 'θ &gt; 90°&nbsp; <b>' + fmtInt(count90) + '</b>';
    el.hudDet.innerHTML = 'detector @ ' + S.detAngle + '°&nbsp; <b>' + fmtInt(detCount) + '</b>';
    el.histModePill.textContent = S.logHist ? 'log' : 'linear';
  }

  var logCount = 0;
  function addLog(msg, cls) {
    if (!el.log) return;
    var row = document.createElement('div');
    row.className = 'row ' + (cls || '');
    var t = document.createElement('span'); t.className = 't';
    var d = new Date();
    t.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    var m = document.createElement('span'); m.className = 'm'; m.textContent = msg;
    row.appendChild(t); row.appendChild(m);
    el.log.insertBefore(row, el.log.firstChild);
    logCount++;
    while (el.log.children.length > 40) el.log.removeChild(el.log.lastChild);
  }

  /* ================================================================== controls */
  var bSel = null;   // selected impact parameter (zoom)

  function wire() {
    var mat = document.getElementById('material');
    mat.addEventListener('change', function () {
      S.material = mat.value;
      el.materialZ.textContent = 'Z = ' + MAT[S.material].Z;
      derive(); resetCounts();
      addLog('Foil changed to ' + MAT[S.material].name + ' (Z=' + MAT[S.material].Z + ')', 'green');
    });

    var energy = document.getElementById('energy');
    energy.addEventListener('input', function () {
      S.energyMeV = parseFloat(energy.value);
      el.energyVal.textContent = S.energyMeV.toFixed(1) + ' MeV';
      derive(); resetCounts();
    });

    var thick = document.getElementById('thickness');
    thick.addEventListener('input', function () {
      S.thicknessUm = parseFloat(thick.value);
      el.thickVal.textContent = S.thicknessUm.toFixed(2) + ' µm';
      derive(); resetCounts();
    });

    var rate = document.getElementById('rate');
    rate.addEventListener('input', function () {
      S.rate = Math.pow(10, parseFloat(rate.value));
      el.rateVal.textContent = (S.rate >= 1e6 ? (S.rate / 1e6).toFixed(1) + ' × 10⁶' : (S.rate / 1e3).toFixed(1) + ' × 10³') + ' /s';
    });

    var det = document.getElementById('detAngle');
    det.addEventListener('input', function () {
      S.detAngle = parseInt(det.value, 10);
      el.detVal.textContent = S.detAngle + '°';
    });

    var impact = document.getElementById('impact');
    impact.addEventListener('input', function () {
      bSel = parseFloat(impact.value);
      el.bVal.textContent = bSel.toFixed(2) + " r₀'";
    });
    bSel = parseFloat(impact.value);
    el.bVal.textContent = bSel.toFixed(2) + " r₀'";

    // switches
    var swMap = { tPaths: 'showPaths', tImpact: 'showImpact', tZoom: 'zoom', tLogHist: 'logHist', tPause: 'paused' };
    Object.keys(swMap).forEach(function (id) {
      var node = document.getElementById(id);
      function toggle() {
        S[swMap[id]] = !S[swMap[id]];
        node.classList.toggle('on', S[swMap[id]]);
        node.setAttribute('aria-checked', String(S[swMap[id]]));
        if (id === 'tZoom') {
          el.bField.style.display = S.zoom ? '' : 'none';
          el.stageLabel.textContent = S.zoom
            ? 'Microscopic view — a single gold nucleus'
            : 'Vacuum chamber — α-particle beam & gold foil';
        }
        if (id === 'tImpact' && S.showImpact) {
          addLog('Impact-parameter marker on', 'green');
        }
      }
      node.addEventListener('click', toggle);
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });

    document.getElementById('btnSingle').addEventListener('click', fireOne);
    document.getElementById('btnReset').addEventListener('click', function () {
      resetCounts();
      addLog('Counters reset', 'green');
    });

    window.addEventListener('resize', function () { fit(); });
  }

  function fireOne() {
    // deliberately aimed near a nucleus so the user sees a clear encounter
    var b = (0.08 + 2.4 * Math.random()) * P.r0p;
    var th = 2 * Math.atan(P.r0p / b);
    var side = Math.random() < 0.5 ? -1 : 1;
    parts.push({ type: 'single', th: th, side: side, p: 0, dur: 1.7 });
    var bU = b / P.r0p;
    addLog('Single α fired — b = ' + bU.toFixed(2) + " r₀',  θ ≈ " + (th * DEG).toFixed(0) + '°',
      th > 90 * RAD ? 'hot' : '');
  }

  function resetCounts() {
    emitted = 0; count90 = 0; detCount = 0;
    hist = new Float64Array(NBINS);
    parts.length = 0; flashes.length = 0; zoomParts.length = 0;
  }

  /* ==================================================================== loop */
  var last = performance.now(), acc = 0;
  function loop(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    render();
    acc += dt;
    if (acc > 0.1) { refreshReadouts(); drawHistogram(); acc = 0; }
    requestAnimationFrame(loop);
  }

  /* ==================================================================== init */
  function init() {
    derive();
    fit();
    wire();
    addLog('Laboratory initialised — ' + MAT[S.material].name + ' foil, ' + S.energyMeV.toFixed(1) + ' MeV α', 'green');
    addLog('Beam on — watching for deflections', 'green');
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
