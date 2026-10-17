/* ============================================================================
   Logic gate circuit builder
   ----------------------------------------------------------------------------
   A small block-diagram editor on a canvas. You place gates, wire an output
   port to an input port, flip input switches, and the circuit is evaluated by
   topological order every frame — so the LEDs and wires light up live.

   The board also enumerates the circuit's complete truth table: it drives every
   INPUT through all 2^n combinations and reads back every OUTPUT.
   ========================================================================== */
(function () {
  'use strict';

  var SPEC = {
    IN:   { label: 'INPUT',  nin: 0, w: 84, h: 44 },
    OUT:  { label: 'OUTPUT', nin: 1, w: 84, h: 44 },
    NOT:  { label: 'NOT',    nin: 1, w: 66, h: 44 },
    AND:  { label: 'AND',    nin: 2, w: 80, h: 52 },
    OR:   { label: 'OR',     nin: 2, w: 80, h: 52 },
    NAND: { label: 'NAND',   nin: 2, w: 80, h: 52 },
    NOR:  { label: 'NOR',    nin: 2, w: 80, h: 52 },
    XOR:  { label: 'XOR',    nin: 2, w: 80, h: 52 },
    XNOR: { label: 'XNOR',   nin: 2, w: 80, h: 52 }
  };

  var canvas, ctx, W = 1000, H = 520, dpr = 1;
  var nodes = [], wires = [], idc = 1;
  var drag = null, wiring = null, hoverNode = null, mouse = { x: -1, y: -1 };
  var TRUTH_EL = null;

  /* ------------------------------------------------------------- node model */
  function addNode(type, x, y) {
    var s = SPEC[type];
    var n = { id: idc++, type: type, x: x, y: y, w: s.w, h: s.h, state: 0, in: [], out: 0, name: '' };
    nodes.push(n);
    return n;
  }
  function byId(id) { for (var i = 0; i < nodes.length; i++) if (nodes[i].id === id) return nodes[i]; return null; }

  function inPort(n, i) { var k = SPEC[n.type].nin; return { x: n.x, y: n.y + n.h * (i + 1) / (k + 1) }; }
  function outPort(n) { return { x: n.x + n.w, y: n.y + n.h / 2 }; }
  function switchRect(n) { return { x: n.x + n.w - 46, y: n.y + n.h / 2 - 10, w: 38, h: 20 }; }
  function deleteRect(n) { return { x: n.x + n.w - 9, y: n.y - 9, w: 18, h: 18 }; }

  function gateOut(type, n) {
    var a = n.in[0] || 0, b = n.in[1] || 0;
    switch (type) {
      case 'IN':   return n.state ? 1 : 0;
      case 'OUT':  return a;
      case 'NOT':  return a ? 0 : 1;
      case 'AND':  return (a & b) ? 1 : 0;
      case 'OR':   return (a | b) ? 1 : 0;
      case 'NAND': return (a & b) ? 0 : 1;
      case 'NOR':  return (a | b) ? 0 : 1;
      case 'XOR':  return (a ^ b) ? 1 : 0;
      case 'XNOR': return (a ^ b) ? 0 : 1;
    }
    return 0;
  }

  function evaluate() {
    var ins = nodes.filter(function (n) { return n.type === 'IN'; }).sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
    ins.forEach(function (n, i) { n.name = String.fromCharCode(65 + i); });
    var outs = nodes.filter(function (n) { return n.type === 'OUT'; }).sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
    outs.forEach(function (n, i) { n.name = 'Y' + (i + 1); });

    var indeg = {}, adj = {};
    nodes.forEach(function (n) { indeg[n.id] = 0; adj[n.id] = []; });
    wires.forEach(function (w) { adj[w.from.node.id].push(w.to.node.id); indeg[w.to.node.id]++; });

    var q = nodes.filter(function (n) { return indeg[n.id] === 0; }).map(function (n) { return n.id; });
    var order = [], seen = {};
    while (q.length) {
      var id = q.shift();
      if (seen[id]) continue;
      seen[id] = true; order.push(id);
      adj[id].forEach(function (t) { if (--indeg[t] === 0) q.push(t); });
    }
    order.forEach(function (id) {
      var n = byId(id);
      n.in = new Array(SPEC[n.type].nin).fill(0);
      wires.forEach(function (w) { if (w.to.node === n) n.in[w.to.idx] = w.from.node.out; });
      n.out = gateOut(n.type, n);
    });
    nodes.forEach(function (n) { if (!seen[n.id]) n.out = 0; });   // anything in a loop
  }

  /* ---------------------------------------------------------- truth table */
  function renderTruthTable() {
    if (!TRUTH_EL) return;
    var ins = nodes.filter(function (n) { return n.type === 'IN'; }).sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
    var outs = nodes.filter(function (n) { return n.type === 'OUT'; }).sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
    if (!ins.length || !outs.length) {
      TRUTH_EL.innerHTML = '<p style="color:var(--muted);font-size:13px;margin:0">Add at least one INPUT and one OUTPUT block to see the circuit\'s truth table.</p>';
      return;
    }
    var saved = ins.map(function (n) { return n.state; });
    var head = '<tr>' + ins.map(function (n) { return '<th>' + n.name + '</th>'; }).join('')
             + outs.map(function (n) { return '<th>' + n.name + '</th>'; }).join('') + '</tr>';
    var body = '';
    for (var m = 0; m < (1 << ins.length); m++) {
      ins.forEach(function (n, k) { n.state = (m >> (ins.length - 1 - k)) & 1; });
      evaluate();
      var cells = ins.map(function (n) { return '<td>' + n.state + '</td>'; }).join('')
                + outs.map(function (n) { return '<td class="' + (n.out ? 'one' : '') + '">' + n.out + '</td>'; }).join('');
      body += '<tr>' + cells + '</tr>';
    }
    ins.forEach(function (n, k) { n.state = saved[k]; });
    evaluate();

    TRUTH_EL.innerHTML = '<table class="truth"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    var idx = 0;
    ins.forEach(function (n, k) { idx |= (n.state ? 1 : 0) << (ins.length - 1 - k); });
    var rows = TRUTH_EL.querySelectorAll('tbody tr');
    if (rows[idx]) rows[idx].classList.add('active');
  }

  /* --------------------------------------------------------------- drawing */
  function roundRect(c, x, y, w, h, r) {
    if (r > w / 2) r = w / 2; if (r > h / 2) r = h / 2;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function bez(p0, p1, t) {
    var dx = Math.max(34, Math.abs(p1.x - p0.x) * 0.5);
    var c0 = { x: p0.x + dx, y: p0.y }, c1 = { x: p1.x - dx, y: p1.y };
    var mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * c0.x + 3 * mt * t * t * c1.x + t * t * t * p1.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * c0.y + 3 * mt * t * t * c1.y + t * t * t * p1.y
    };
  }
  function bezCtrl(p0, p1) {
    var dx = Math.max(34, Math.abs(p1.x - p0.x) * 0.5);
    return [{ x: p0.x + dx, y: p0.y }, { x: p1.x - dx, y: p1.y }];
  }

  function drawGrid() {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (var x = 20; x < W; x += 26) for (var y = 20; y < H; y += 26) {
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  function drawWire(w) {
    var p0 = outPort(w.from.node), p1 = inPort(w.to.node, w.to.idx);
    var ctrl = bezCtrl(p0, p1);
    var live = w.from.node.out === 1;
    ctx.save();
    ctx.lineWidth = live ? 2.4 : 1.8;
    ctx.strokeStyle = live ? 'rgba(116,255,176,0.95)' : 'rgba(150,166,190,0.45)';
    if (live) { ctx.shadowColor = 'rgba(116,255,176,0.8)'; ctx.shadowBlur = 10; }
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(ctrl[0].x, ctrl[0].y, ctrl[1].x, ctrl[1].y, p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
    // moving pulse on live wires
    if (live) {
      var t = (performance.now() / 900) % 1;
      var pt = bez(p0, p1, t);
      ctx.save();
      ctx.fillStyle = 'rgba(220,255,235,0.95)';
      ctx.shadowColor = 'rgba(116,255,176,1)'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.6, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  function drawPort(p, filled, highlight) {
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, highlight ? 6.5 : 4.6, 0, 7);
    ctx.fillStyle = filled ? 'rgba(116,255,176,0.95)' : 'rgba(20,28,42,0.95)';
    ctx.strokeStyle = highlight ? 'rgba(241,196,83,0.95)' : 'rgba(150,166,190,0.6)';
    ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawNode(n) {
    var s = SPEC[n.type];
    ctx.save();
    // body
    var grad = ctx.createLinearGradient(n.x, n.y, n.x, n.y + n.h);
    grad.addColorStop(0, 'rgba(24,33,50,0.98)');
    grad.addColorStop(1, 'rgba(15,21,33,0.98)');
    ctx.fillStyle = grad;
    ctx.strokeStyle = (n === hoverNode) ? 'rgba(241,196,83,0.55)' : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.4;
    roundRect(ctx, n.x, n.y, n.w, n.h, 9); ctx.fill(); ctx.stroke();

    // title
    ctx.fillStyle = 'rgba(233,239,248,0.95)';
    ctx.font = '600 12.5px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (n.type === 'IN') { ctx.textAlign = 'left'; ctx.font = '700 19px "Space Grotesk", Inter, sans-serif'; ctx.fillStyle = 'rgba(241,196,83,0.98)'; ctx.fillText(n.name, n.x + 12, n.y + n.h / 2); }
    else if (n.type === 'OUT') { ctx.textAlign = 'left'; ctx.font = '700 17px "Space Grotesk", Inter, sans-serif'; ctx.fillStyle = 'rgba(233,239,248,0.95)'; ctx.fillText(n.name, n.x + 12, n.y + n.h / 2); }
    else ctx.fillText(n.type, n.x + n.w / 2, n.y + n.h / 2);

    // input ports
    for (var i = 0; i < s.nin; i++) {
      var ip = inPort(n, i);
      drawPort(ip, n.in[i] === 1, false);
    }
    // output port
    if (n.type !== 'OUT') drawPort(outPort(n), n.out === 1, false);

    // switch (INPUT)
    if (n.type === 'IN') {
      var sr = switchRect(n);
      ctx.fillStyle = n.state ? 'rgba(116,255,176,0.28)' : 'rgba(255,255,255,0.12)';
      roundRect(ctx, sr.x, sr.y, sr.w, sr.h, 10); ctx.fill();
      ctx.fillStyle = n.state ? 'rgba(116,255,176,1)' : 'rgba(203,214,230,1)';
      ctx.beginPath(); ctx.arc(n.state ? sr.x + sr.w - 10 : sr.x + 10, sr.y + sr.h / 2, 7, 0, 7); ctx.fill();
    }
    // LED (OUTPUT)
    if (n.type === 'OUT') {
      var cx = n.x + n.w - 22, cy = n.y + n.h / 2;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7);
      if (n.out) { ctx.fillStyle = 'rgba(116,255,176,1)'; ctx.shadowColor = 'rgba(116,255,176,1)'; ctx.shadowBlur = 16; }
      else { ctx.fillStyle = 'rgba(18,41,28,1)'; ctx.strokeStyle = 'rgba(116,255,176,0.28)'; ctx.lineWidth = 1.4; }
      ctx.fill(); if (!n.out) ctx.stroke();
    }
    ctx.restore();

    // delete button on hover
    if (n === hoverNode) {
      var dr = deleteRect(n);
      ctx.save();
      ctx.fillStyle = 'rgba(255,111,111,0.95)';
      ctx.beginPath(); ctx.arc(dr.x + 9, dr.y + 9, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(dr.x + 5, dr.y + 5); ctx.lineTo(dr.x + 13, dr.y + 13);
      ctx.moveTo(dr.x + 13, dr.y + 5); ctx.lineTo(dr.x + 5, dr.y + 13);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawGhost() {
    var p0 = outPort(wiring.node), p1 = { x: mouse.x, y: mouse.y };
    var ctrl = bezCtrl(p0, p1);
    ctx.save();
    ctx.strokeStyle = 'rgba(241,196,83,0.85)';
    ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(ctrl[0].x, ctrl[0].y, ctrl[1].x, ctrl[1].y, p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    evaluate();
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    wires.forEach(drawWire);
    if (wiring) drawGhost();
    nodes.forEach(drawNode);
  }

  /* -------------------------------------------------------------- hit tests */
  function portAt(x, y) {
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.type !== 'OUT') {
        var op = outPort(n);
        if (Math.hypot(op.x - x, op.y - y) < 10) return { node: n, kind: 'out', idx: 0 };
      }
      for (var k = 0; k < SPEC[n.type].nin; k++) {
        var ip = inPort(n, k);
        if (Math.hypot(ip.x - x, ip.y - y) < 10) return { node: n, kind: 'in', idx: k };
      }
    }
    return null;
  }
  function nodeAt(x, y) {
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n;
    }
    return null;
  }
  function wireAt(x, y) {
    for (var i = wires.length - 1; i >= 0; i--) {
      var w = wires[i];
      var p0 = outPort(w.from.node), p1 = inPort(w.to.node, w.to.idx);
      for (var t = 0; t <= 1; t += 0.04) {
        var pt = bez(p0, p1, t);
        if (Math.hypot(pt.x - x, pt.y - y) < 7) return w;
      }
    }
    return null;
  }
  function inRect(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  /* ---------------------------------------------------------------- events */
  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  function onDown(e) {
    var p = pos(e);
    var port = portAt(p.x, p.y);
    if (port && port.kind === 'out') { wiring = { node: port.node }; return; }

    var n = nodeAt(p.x, p.y);
    if (n) {
      // delete button
      if (n === hoverNode && inRect(deleteRect(n), p.x, p.y)) { removeNode(n); return; }
      // input switch
      if (n.type === 'IN' && inRect(switchRect(n), p.x, p.y)) {
        n.state = n.state ? 0 : 1;
        evaluate(); renderTruthTable();
        return;
      }
      drag = { node: n, dx: p.x - n.x, dy: p.y - n.y };
      nodes.splice(nodes.indexOf(n), 1); nodes.push(n);   // bring to front
      return;
    }

    var w = wireAt(p.x, p.y);
    if (w) { removeWire(w); return; }
  }

  function onMove(e) {
    var p = pos(e);
    mouse = p;
    if (drag) {
      drag.node.x = Math.max(4, Math.min(W - drag.node.w - 4, p.x - drag.dx));
      drag.node.y = Math.max(4, Math.min(H - drag.node.h - 4, p.y - drag.dy));
      return;
    }
    hoverNode = nodeAt(p.x, p.y);
    canvas.style.cursor = wiring ? 'crosshair' : (portAt(p.x, p.y) ? 'pointer' : (hoverNode ? 'move' : 'default'));
  }

  function onUp(e) {
    if (wiring) {
      var p = pos(e);
      var port = portAt(p.x, p.y);
      if (port && port.kind === 'in') connect(wiring.node, port.node, port.idx);
      wiring = null;
    }
    if (drag) { drag = null; evaluate(); renderTruthTable(); }
  }

  function connect(fromNode, toNode, toIdx) {
    if (fromNode === toNode) return;
    // one wire per input port
    wires = wires.filter(function (w) { return !(w.to.node === toNode && w.to.idx === toIdx); });
    wires.push({ from: { node: fromNode }, to: { node: toNode, idx: toIdx } });
    evaluate(); renderTruthTable();
  }
  function removeWire(w) {
    wires.splice(wires.indexOf(w), 1);
    evaluate(); renderTruthTable();
  }
  function removeNode(n) {
    wires = wires.filter(function (w) { return w.from.node !== n && w.to.node !== n; });
    nodes.splice(nodes.indexOf(n), 1);
    evaluate(); renderTruthTable();
  }

  /* -------------------------------------------------------------- presets */
  function clearBoard() { nodes = []; wires = []; idc = 1; }

  function presetHalfAdder() {
    clearBoard();
    var A = addNode('IN', 60, 90), B = addNode('IN', 60, 210);
    var x = addNode('XOR', 300, 90), an = addNode('AND', 300, 210);
    var S = addNode('OUT', 520, 90), C = addNode('OUT', 520, 210);
    connect(A, x, 0); connect(B, x, 1); connect(A, an, 0); connect(B, an, 1);
    connect(x, S, 0); connect(an, C, 0);
  }
  // OR built only from NAND gates (NAND is a universal gate)
  function presetOrFromNand() {
    clearBoard();
    var A = addNode('IN', 40, 80), B = addNode('IN', 40, 250);
    var n1 = addNode('NAND', 230, 80), n2 = addNode('NAND', 230, 250);
    var n3 = addNode('NAND', 430, 165), Y = addNode('OUT', 620, 165);
    connect(A, n1, 0); connect(A, n1, 1);   // NAND(A,A) = NOT A
    connect(B, n2, 0); connect(B, n2, 1);   // NAND(B,B) = NOT B
    connect(n1, n3, 0); connect(n2, n3, 1); // NAND(NOT A, NOT B) = A OR B
    connect(n3, Y, 0);
  }
  function presetDeMorgan() {
    clearBoard();
    var A = addNode('IN', 30, 60), B = addNode('IN', 30, 215);
    var nd = addNode('NAND', 225, 60), Y1 = addNode('OUT', 420, 60);
    var na = addNode('NOT', 185, 180), nb = addNode('NOT', 185, 285);
    var or = addNode('OR', 380, 230), Y2 = addNode('OUT', 560, 230);
    connect(A, nd, 0); connect(B, nd, 1); connect(nd, Y1, 0);
    connect(A, na, 0); connect(B, nb, 0);
    connect(na, or, 0); connect(nb, or, 1); connect(or, Y2, 0);
  }
  function presetMux() {
    clearBoard();
    var A = addNode('IN', 30, 50), B = addNode('IN', 30, 165), S = addNode('IN', 30, 280);
    var ns = addNode('NOT', 175, 280);
    var a1 = addNode('AND', 310, 50), a2 = addNode('AND', 310, 165);
    var or = addNode('OR', 500, 108), Y = addNode('OUT', 660, 108);
    connect(S, ns, 0);
    connect(A, a1, 0); connect(ns, a1, 1);
    connect(B, a2, 0); connect(S, a2, 1);
    connect(a1, or, 0); connect(a2, or, 1); connect(or, Y, 0);
  }

  /* ---------------------------------------------------------------- setup */
  function fit() {
    var wrap = document.getElementById('boardWrap');
    var r = wrap.getBoundingClientRect();
    W = Math.max(320, Math.floor(r.width));
    H = Math.round(Math.min(430, Math.max(350, W * 0.44)));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildPalette() {
    var items = [['IN', 'Input'], ['OUT', 'Output'], ['AND', 'AND'], ['OR', 'OR'], ['NOT', 'NOT'],
                 ['NAND', 'NAND'], ['NOR', 'NOR'], ['XOR', 'XOR'], ['XNOR', 'XNOR']];
    var html = '';
    items.forEach(function (it) { html += '<button class="btn" data-add="' + it[0] + '" style="padding:8px 13px;font-size:13px">+ ' + it[1] + '</button>'; });
    var pel = document.getElementById('palette');
    pel.innerHTML = html;
    pel.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      // drop in the first free slot
      var slot = 0, x, y, tries = 0;
      do {
        x = 60 + (slot % 5) * 150;
        y = 60 + Math.floor(slot / 5) * 110;
        slot++; tries++;
      } while (nodes.some(function (n) { return Math.abs(n.x - x) < 100 && Math.abs(n.y - y) < 70; }) && tries < 40);
      addNode(b.getAttribute('data-add'), x, y);
      evaluate(); renderTruthTable();
    });
  }

  function buildPresets() {
    var items = [['Half adder', presetHalfAdder], ['OR from NAND', presetOrFromNand],
                 ['De Morgan', presetDeMorgan], ['2:1 MUX', presetMux]];
    var html = '';
    items.forEach(function (it, i) { html += '<button class="btn ghost" data-preset="' + i + '" style="padding:8px 13px;font-size:13px">' + it[0] + '</button>'; });
    html += '<button class="btn ghost" id="clearBoard" style="padding:8px 13px;font-size:13px">Clear</button>';
    var el = document.getElementById('presets');
    el.innerHTML = html;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'clearBoard') { clearBoard(); evaluate(); renderTruthTable(); return; }
      var i = parseInt(b.getAttribute('data-preset'), 10);
      if (items[i]) { items[i][1](); evaluate(); renderTruthTable(); }
    });
  }

  function loop() {
    if (canvas.offsetParent !== null) draw();   // skip while the tab is hidden
    requestAnimationFrame(loop);
  }

  function init() {
    canvas = document.getElementById('boardCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    TRUTH_EL = document.getElementById('circuitTruth');
    fit();
    buildPalette();
    buildPresets();
    presetHalfAdder();
    evaluate();
    renderTruthTable();

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', function () { fit(); });
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
