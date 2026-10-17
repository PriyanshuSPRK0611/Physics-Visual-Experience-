/* ============================================================================
   Boolean Algebra & Logic Gates — interactive lab
   ----------------------------------------------------------------------------
   Three things happen on this page, all of them computed live:

   1. A gate bench — the seven basic gates driven by three shared switches.
   2. An expression lab — a small recursive-descent parser for Boolean
      expressions, a full truth table, a Karnaugh map, and a Quine–McCluskey
      simplification down to a minimal sum-of-products.
   3. A law verifier — proofs of the standard identities, row by row.

   Nothing is hard-coded: the truth tables, K-maps and simplified expressions are
   derived from whatever you type.
   ========================================================================== */
(function () {
  'use strict';

  var VARS = ['A', 'B', 'C', 'D'];
  var inputs = { A: 0, B: 0, C: 0, D: 0 };
  var currentExpr = 'A·B + ¬C';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ======================================================= expression parser */
  function normalize(s) {
    s = String(s).toUpperCase();
    s = s.replace(/\bAND\b/g, '&').replace(/\bOR\b/g, '+')
         .replace(/\bNOT\b/g, '!').replace(/\bXOR\b/g, '^');
    s = s.replace(/[\u00AC\u007E]/g, '!')       // ¬ ~
         .replace(/[\u2227]/g, '&')             // ∧
         .replace(/[\u00B7\u22C5\*]/g, '&')     // · ⋅ *
         .replace(/[\u2228]/g, '+')             // ∨
         .replace(/[\u2295]/g, '^');            // ⊕
    return s.replace(/\s+/g, '');
  }

  function parse(str) {
    var s = normalize(str);
    if (!s) throw new Error('empty expression');
    var i = 0;
    function peek() { return s[i]; }

    function or() {
      var l = xor();
      while (peek() === '+') { i++; l = { op: 'or', a: l, b: xor() }; }
      return l;
    }
    function xor() {
      var l = and();
      while (peek() === '^') { i++; l = { op: 'xor', a: l, b: and() }; }
      return l;
    }
    function and() {
      var l = not();
      while (true) {
        var c = peek();
        if (c === '&') { i++; l = { op: 'and', a: l, b: not() }; }
        else if (c && /[A-D01(]/.test(c)) { l = { op: 'and', a: l, b: not() }; } // juxtaposition
        else break;
      }
      return l;
    }
    function not() {
      if (peek() === '!') { i++; return { op: 'not', a: not() }; }
      var a = atom();
      while (peek() === "'") { i++; a = { op: 'not', a: a }; }
      return a;
    }
    function atom() {
      var c = peek();
      if (c === '(') {
        i++;
        var e = or();
        if (peek() === ')') i++; else throw new Error('missing ")"');
        return e;
      }
      if (c && /[A-D]/.test(c)) { i++; return { op: 'var', name: c }; }
      if (c === '0') { i++; return { op: 'const', v: 0 }; }
      if (c === '1') { i++; return { op: 'const', v: 1 }; }
      throw new Error('unexpected "' + (c === undefined ? 'end of expression' : c) + '"');
    }

    var ast = or();
    if (i < s.length) throw new Error('unexpected "' + s[i] + '"');
    return ast;
  }

  function ev(node, env) {
    switch (node.op) {
      case 'var':   return env[node.name] ? 1 : 0;
      case 'const': return node.v;
      case 'not':   return ev(node.a, env) ? 0 : 1;
      case 'and':   return (ev(node.a, env) & ev(node.b, env)) ? 1 : 0;
      case 'or':    return (ev(node.a, env) | ev(node.b, env)) ? 1 : 0;
      case 'xor':   return (ev(node.a, env) ^ ev(node.b, env)) ? 1 : 0;
    }
    return 0;
  }

  function collectVars(node, set) {
    set = set || {};
    if (node.op === 'var') set[node.name] = true;
    if (node.a) collectVars(node.a, set);
    if (node.b) collectVars(node.b, set);
    return set;
  }

  function enumerate(node, vars) {
    var n = vars.length, rows = [], outputs = new Array(1 << n);
    for (var m = 0; m < (1 << n); m++) {
      var env = {};
      for (var k = 0; k < n; k++) env[vars[k]] = (m >> (n - 1 - k)) & 1;
      var o = ev(node, env);
      outputs[m] = o;
      rows.push({ m: m, env: env, out: o });
    }
    return { rows: rows, outputs: outputs };
  }

  /* ============================================== Quine–McCluskey minimisation */
  function toBits(m, n) {
    var s = '';
    for (var k = n - 1; k >= 0; k--) s += ((m >> k) & 1) ? '1' : '0';
    return s;
  }
  function dash(n) { var s = ''; for (var k = 0; k < n; k++) s += '-'; return s; }

  function minimalCover(primes, minterms) {
    var coverCount = {}, covered = {}, chosen = [];
    minterms.forEach(function (m) { coverCount[m] = 0; });
    primes.forEach(function (pr) { pr.covers.forEach(function (m) { coverCount[m]++; }); });

    minterms.forEach(function (m) {
      if (coverCount[m] === 1) {
        var pr = null;
        for (var k = 0; k < primes.length; k++) if (primes[k].covers.indexOf(m) >= 0) { pr = primes[k]; break; }
        if (pr && chosen.indexOf(pr) < 0) {
          chosen.push(pr);
          pr.covers.forEach(function (x) { covered[x] = true; });
        }
      }
    });

    var remaining = minterms.filter(function (m) { return !covered[m]; });
    while (remaining.length) {
      var best = null, bestCount = -1;
      primes.forEach(function (pr) {
        if (chosen.indexOf(pr) >= 0) return;
        var cnt = pr.covers.filter(function (m) { return !covered[m]; }).length;
        if (cnt > bestCount) { bestCount = cnt; best = pr; }
      });
      if (!best) break;
      chosen.push(best);
      best.covers.forEach(function (x) { covered[x] = true; });
      remaining = minterms.filter(function (m) { return !covered[m]; });
    }
    return chosen;
  }

  function quineMcCluskey(minterms, n) {
    minterms = minterms.slice().sort(function (a, b) { return a - b; });
    if (minterms.length === 0) return { constant: '0', primes: [], chosen: [] };
    if (minterms.length === (1 << n)) return { constant: '1', primes: [{ bits: dash(n), covers: minterms.slice() }], chosen: [] };

    var current = minterms.map(function (m) { return { bits: toBits(m, n), covers: [m] }; });
    var primes = [];
    while (current.length) {
      var used = current.map(function () { return false; });
      var map = {};
      for (var a = 0; a < current.length; a++) {
        for (var b = a + 1; b < current.length; b++) {
          var x = current[a].bits, y = current[b].bits, diff = -1, ok = true;
          for (var k = 0; k < n; k++) {
            if (x[k] !== y[k]) { if (diff === -1) diff = k; else { ok = false; break; } }
          }
          if (ok && diff >= 0) {
            used[a] = true; used[b] = true;
            var bits = x.substring(0, diff) + '-' + x.substring(diff + 1);
            if (!map[bits]) map[bits] = { bits: bits, covers: [] };
            var t = map[bits];
            current[a].covers.forEach(function (m) { if (t.covers.indexOf(m) < 0) t.covers.push(m); });
            current[b].covers.forEach(function (m) { if (t.covers.indexOf(m) < 0) t.covers.push(m); });
          }
        }
      }
      for (var p = 0; p < current.length; p++) if (!used[p]) primes.push(current[p]);
      current = Object.keys(map).map(function (kk) { return map[kk]; });
    }

    var seen = {}, uniq = [];
    primes.forEach(function (pr) { if (!seen[pr.bits]) { seen[pr.bits] = true; uniq.push(pr); } });

    return { constant: null, primes: uniq, chosen: minimalCover(uniq, minterms) };
  }

  function termString(bits, vars) {
    var parts = [];
    for (var k = 0; k < bits.length; k++) {
      if (bits[k] === '1') parts.push(vars[k]);
      else if (bits[k] === '0') parts.push('\u00AC' + vars[k]);
    }
    return parts.length ? parts.join('\u00B7') : '1';
  }
  function sopString(terms, vars) {
    if (!terms.length) return '0';
    return terms.map(function (b) { return termString(b, vars); }).join(' + ');
  }
  function literalsOf(bits) {
    var c = 0;
    for (var k = 0; k < bits.length; k++) if (bits[k] !== '-') c++;
    return c;
  }

  /* ================================================================ gate bench */
  var GATES = [
    { name: 'NOT',  sub: 'out = \u00ACA',        ins: ['A'],    sym: 'not',  fn: function (v) { return v.A ? 0 : 1; } },
    { name: 'AND',  sub: 'out = A \u00B7 B',     ins: ['A', 'B'], sym: 'and',  fn: function (v) { return (v.A & v.B) ? 1 : 0; } },
    { name: 'OR',   sub: 'out = A + B',          ins: ['A', 'B'], sym: 'or',   fn: function (v) { return (v.A | v.B) ? 1 : 0; } },
    { name: 'NAND', sub: 'out = \u00AC(A \u00B7 B)', ins: ['A', 'B'], sym: 'nand', fn: function (v) { return (v.A & v.B) ? 0 : 1; } },
    { name: 'NOR',  sub: 'out = \u00AC(A + B)',  ins: ['A', 'B'], sym: 'nor',  fn: function (v) { return (v.A | v.B) ? 0 : 1; } },
    { name: 'XOR',  sub: 'out = A \u2295 B',     ins: ['A', 'B'], sym: 'xor',  fn: function (v) { return (v.A ^ v.B) ? 1 : 0; } },
    { name: 'XNOR', sub: 'out = \u00AC(A \u2295 B)', ins: ['A', 'B'], sym: 'xnor', fn: function (v) { return (v.A ^ v.B) ? 0 : 1; } }
  ];

  function svgGate(type) {
    var s = '<svg width="48" height="30" viewBox="0 0 48 30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">';
    function ins(n) {
      var o = '';
      if (n === 2) { o += '<line x1="0" y1="10" x2="7" y2="10"/><line x1="0" y1="20" x2="7" y2="20"/>'; }
      else { o += '<line x1="0" y1="15" x2="9" y2="15"/>'; }
      return o;
    }
    if (type === 'and' || type === 'nand') {
      s += ins(2) + '<path d="M7 5 H20 A10 10 0 0 1 20 25 H7 Z"/>';
      if (type === 'nand') s += '<circle cx="33" cy="15" r="3"/><line x1="36" y1="15" x2="48" y2="15"/>';
      else s += '<line x1="30" y1="15" x2="48" y2="15"/>';
    } else if (type === 'or' || type === 'nor' || type === 'xor' || type === 'xnor') {
      s += ins(2);
      if (type === 'xor' || type === 'xnor') s += '<path d="M2 5 Q9 15 2 25"/>';
      s += '<path d="M7 5 Q19 5 30 15 Q19 25 7 25 Q13 15 7 5 Z"/>';
      if (type === 'nor' || type === 'xnor') s += '<circle cx="33" cy="15" r="3"/><line x1="36" y1="15" x2="48" y2="15"/>';
      else s += '<line x1="30" y1="15" x2="48" y2="15"/>';
    } else { // not
      s += ins(1) + '<path d="M9 5 L27 15 L9 25 Z"/><circle cx="30" cy="15" r="3"/><line x1="33" y1="15" x2="48" y2="15"/>';
    }
    return s + '</svg>';
  }

  function renderBus() {
    var html = '';
    ['A', 'B', 'C'].forEach(function (v) {
      html += '<div class="ioswitch' + (inputs[v] ? ' on' : '') + '" data-var="' + v + '" role="switch" aria-checked="' + (inputs[v] ? 'true' : 'false') + '" tabindex="0">'
            + '<span class="nm">' + v + '</span>'
            + '<span class="vl">' + inputs[v] + '</span>'
            + '<span class="st"></span>'
            + '</div>';
    });
    document.getElementById('bus').innerHTML = html;
  }

  function renderGates() {
    var html = '';
    GATES.forEach(function (g) {
      var val = g.fn(inputs);
      var insHtml = g.ins.map(function (v) {
        return '<span class="gc-in">' + v + ' <b>' + inputs[v] + '</b></span>';
      }).join('');
      // truth table over this gate's own inputs
      var n = g.ins.length, rows = '';
      for (var m = 0; m < (1 << n); m++) {
        var env = {}, cells = '', active = true;
        for (var k = 0; k < n; k++) {
          var bit = (m >> (n - 1 - k)) & 1;
          env[g.ins[k]] = bit;
          cells += '<td>' + bit + '</td>';
          if (inputs[g.ins[k]] !== bit) active = false;
        }
        var o = g.fn(env);
        rows += '<tr class="' + (active ? 'active' : '') + '">' + cells
              + '<td class="' + (o ? 'one' : '') + '">' + o + '</td></tr>';
      }
      var head = g.ins.map(function (v) { return '<th>' + v + '</th>'; }).join('') + '<th>out</th>';

      html += '<div class="gate-card">'
        + '<div class="gc-head"><div class="gc-name">' + g.name + '<small>' + g.sub + '</small></div>'
        + '<div class="gc-sym">' + svgGate(g.sym) + '</div></div>'
        + '<div class="gc-io">' + insHtml
        + '<span class="gc-out">out <span class="led' + (val ? ' on' : '') + '"></span></span></div>'
        + '<table class="truth"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>'
        + '</div>';
    });
    document.getElementById('gateGrid').innerHTML = html;
  }

  /* ========================================================== expression lab */
  var EXPR_EL, STATUS_EL, TRUTH_EL, KMAP_EL, PI_EL, SIMP_EL;

  function grayOrder(k) {
    var out = [];
    for (var i = 0; i < (1 << k); i++) out.push(i ^ (i >> 1));
    return out;
  }

  var PI_COLORS = ['rgba(90,209,255,0.85)', 'rgba(241,196,83,0.85)', 'rgba(169,139,255,0.85)',
                   'rgba(116,255,176,0.85)', 'rgba(255,140,120,0.85)', 'rgba(120,200,255,0.85)'];

  function currentIndex(vars) {
    var n = vars.length, idx = 0;
    for (var k = 0; k < n; k++) idx |= (inputs[vars[k]] ? 1 : 0) << (n - 1 - k);
    return idx;
  }

  function renderExprLab(exprString) {
    currentExpr = exprString;
    var ast, vars, n, en, minterms, qm, curIdx;

    try {
      ast = parse(exprString);
    } catch (e) {
      STATUS_EL.className = 'status err';
      STATUS_EL.textContent = '\u26A0 ' + e.message;
      TRUTH_EL.innerHTML = ''; KMAP_EL.innerHTML = ''; PI_EL.innerHTML = ''; SIMP_EL.innerHTML = '';
      return;
    }

    var used = collectVars(ast);
    vars = VARS.filter(function (v) { return used[v]; });
    n = vars.length;
    en = enumerate(ast, vars);
    minterms = [];
    for (var m = 0; m < en.outputs.length; m++) if (en.outputs[m]) minterms.push(m);
    qm = quineMcCluskey(minterms, n);
    curIdx = currentIndex(vars);

    STATUS_EL.className = 'status ok';
    STATUS_EL.textContent = '\u2713 parsed — ' + n + ' variable' + (n === 1 ? '' : 's')
      + ' (' + vars.join(', ') + '), ' + minterms.length + ' of ' + en.outputs.length + ' rows true';

    renderTruth(vars, en, curIdx);
    renderKmap(vars, n, en, qm, curIdx);
    renderSimp(exprString, vars, n, en, minterms, qm);
  }

  function renderTruth(vars, en, curIdx) {
    var n = vars.length;
    var head = '<tr><th>#</th>' + vars.map(function (v) { return '<th>' + v + '</th>'; }).join('') + '<th>out</th></tr>';
    var body = '';
    en.rows.forEach(function (r) {
      var cells = vars.map(function (v) { return '<td>' + r.env[v] + '</td>'; }).join('');
      body += '<tr class="' + (r.m === curIdx ? 'active' : '') + '">'
            + '<td class="lab">' + r.m + '</td>' + cells
            + '<td class="' + (r.out ? 'one' : '') + '">' + r.out + '</td></tr>';
    });
    TRUTH_EL.innerHTML = '<table class="truth"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function renderKmap(vars, n, en, qm, curIdx) {
    if (n === 0) {
      KMAP_EL.innerHTML = '<table class="kmap"><tbody><tr><td class="' + (en.outputs[0] ? 'one' : '') + '">' + en.outputs[0] + '</td></tr></tbody></table>';
      PI_EL.innerHTML = '';
      return;
    }
    var rowBits = Math.floor(n / 2), colBits = n - rowBits;
    var rowVals = grayOrder(rowBits), colVals = grayOrder(colBits);
    var rowVars = vars.slice(0, rowBits), colVars = vars.slice(rowBits);

    // which cells belong to which prime implicant
    var cellPi = {};   // minterm -> [piIndex...]
    qm.primes.forEach(function (pr, idx) {
      pr.covers.forEach(function (mm) {
        (cellPi[mm] = cellPi[mm] || []).push(idx);
      });
    });

    var corner = (rowVars.length ? rowVars.join('') + ' \\ ' : '') + colVars.join('');
    var html = '<table class="kmap"><thead><tr><th>' + corner + '</th>';
    colVals.forEach(function (cv) {
      html += '<th>' + toBits(cv, colBits) + '</th>';
    });
    html += '</tr></thead><tbody>';

    rowVals.forEach(function (rv) {
      html += '<tr>';
      if (rowBits > 0) html += '<th>' + toBits(rv, rowBits) + '</th>';
      colVals.forEach(function (cv) {
        var mm = (rv << colBits) | cv;
        var out = en.outputs[mm];
        var cls = out ? 'one' : '';
        if (mm === curIdx) cls += ' cur';
        var style = '';
        if (cellPi[mm]) { style = ' style="--pc:' + PI_COLORS[cellPi[mm][0] % PI_COLORS.length] + '"'; cls += ' pi'; }
        html += '<td class="' + cls + '" data-m="' + mm + '"' + style + '>' + out
              + '<span class="cellidx">' + mm + '</span></td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    KMAP_EL.innerHTML = html;

    // prime-implicant chips with hover highlight
    var chips = '';
    qm.primes.forEach(function (pr, idx) {
      var color = PI_COLORS[idx % PI_COLORS.length];
      chips += '<span class="chip pi" data-pi="' + idx + '" style="color:var(--ink)">'
            + '<span class="dot" style="background:' + color + '"></span>' + termString(pr.bits, vars)
            + '</span>';
    });
    if (!qm.primes.length) chips = '<span class="chip pi">no implicants</span>';
    PI_EL.innerHTML = chips;

    // hover behaviour
    Array.prototype.forEach.call(PI_EL.querySelectorAll('.chip.pi'), function (chip) {
      var idx = parseInt(chip.getAttribute('data-pi'), 10);
      var cells = PI_EL.parentElement.querySelectorAll('.kmap td');
      function enter() {
        Array.prototype.forEach.call(cells, function (c) { c.classList.add('dim'); });
        Array.prototype.forEach.call(cells, function (c) {
          if (qm.primes[idx] && qm.primes[idx].covers.indexOf(parseInt(c.getAttribute('data-m'), 10)) >= 0) {
            c.classList.remove('dim'); c.classList.add('hot');
          }
        });
      }
      function leave() {
        Array.prototype.forEach.call(cells, function (c) { c.classList.remove('dim', 'hot'); });
      }
      chip.addEventListener('mouseenter', enter);
      chip.addEventListener('mouseleave', leave);
    });
  }

  function renderSimp(exprString, vars, n, en, minterms, qm) {
    var canonicalTerms = minterms.map(function (m) { return toBits(m, n); });
    var canonical = qm.constant ? qm.constant : sopString(canonicalTerms, vars);
    var simplified = qm.constant ? qm.constant : sopString(qm.chosen.map(function (p) { return p.bits; }), vars);
    var canonLits = canonicalTerms.reduce(function (a, b) { return a + literalsOf(b); }, 0);
    var simpLits = qm.chosen.reduce(function (a, p) { return a + literalsOf(p.bits); }, 0);
    var mintermList = minterms.length ? minterms.join(', ') : 'none';

    SIMP_EL.innerHTML = '<div class="simp">'
      + '<div class="s"><span>Canonical sum-of-products</span><div class="val">' + esc(canonical) + '</div></div>'
      + '<div class="s"><span>Simplified (Quine–McCluskey)</span><div class="val gold">' + esc(simplified) + '</div></div>'
      + '<div class="s"><span>Minterms &nbsp;Σ m</span><div class="val scint">' + mintermList + '</div></div>'
      + '<div class="s"><span>Prime implicants</span><div class="val">' + qm.primes.length + '</div></div>'
      + '<div class="s"><span>Literals (canonical → simplified)</span><div class="val">' + canonLits + ' \u2192 ' + simpLits + '</div></div>'
      + '</div>';
  }

  /* =================================================================== laws */
  var LAWS = [
    { name: 'Identity',     lhs: 'A + 0',      rhs: 'A' },
    { name: 'Null',         lhs: 'A \u00B7 0', rhs: '0' },
    { name: 'Idempotent',   lhs: 'A + A',      rhs: 'A' },
    { name: 'Complement',   lhs: 'A + \u00ACA', rhs: '1' },
    { name: 'Absorption',   lhs: 'A + A\u00B7B', rhs: 'A' },
    { name: 'Distributive', lhs: 'A\u00B7(B+C)', rhs: 'A\u00B7B + A\u00B7C' },
    { name: 'De Morgan 1',  lhs: '\u00AC(A\u00B7B)', rhs: '\u00ACA + \u00ACB' },
    { name: 'De Morgan 2',  lhs: '\u00AC(A+B)', rhs: '\u00ACA \u00B7 \u00ACB' }
  ];

  function renderLawSeg() {
    var html = '';
    LAWS.forEach(function (l, i) {
      html += '<button data-law="' + i + '"' + (i === 0 ? ' class="on"' : '') + '>' + l.name + '</button>';
    });
    document.getElementById('lawSeg').innerHTML = html;
  }

  function renderLaw(i) {
    var law = LAWS[i];
    var la, ra, vars;
    try {
      la = parse(law.lhs); ra = parse(law.rhs);
    } catch (e) {
      document.getElementById('lawProof').innerHTML = '<p style="color:var(--danger)">' + esc(e.message) + '</p>';
      return;
    }
    var used = collectVars(la); collectVars(ra, used);
    vars = VARS.filter(function (v) { return used[v]; });
    var n = vars.length, allMatch = true;

    var head = '<tr>' + vars.map(function (v) { return '<th>' + v + '</th>'; }).join('')
             + '<th>LHS</th><th>RHS</th><th></th></tr>';
    var body = '';
    for (var m = 0; m < (1 << n); m++) {
      var env = {};
      for (var k = 0; k < n; k++) env[vars[k]] = (m >> (n - 1 - k)) & 1;
      var lv = ev(la, env), rv = ev(ra, env);
      if (lv !== rv) allMatch = false;
      body += '<tr>' + vars.map(function (v) { return '<td>' + env[v] + '</td>'; }).join('')
            + '<td class="' + (lv ? 'one' : '') + '">' + lv + '</td>'
            + '<td class="' + (rv ? 'one' : '') + '">' + rv + '</td>'
            + '<td class="eq">' + (lv === rv ? '\u2713' : '\u2717') + '</td></tr>';
    }

    document.getElementById('lawProof').innerHTML =
      '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-bottom:16px">'
      + '<span class="formula" style="margin:0">' + esc(law.lhs) + ' &nbsp;=&nbsp; ' + esc(law.rhs) + '</span>'
      + '<span class="status ' + (allMatch ? 'ok' : 'err') + '" style="margin:0">'
      + (allMatch ? '\u2713 both sides agree in every row — the law holds' : '\u2717 rows differ') + '</span>'
      + '</div>'
      + '<div class="truth-wrap"><table class="truth"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  /* ================================================================== wiring */
  function refresh() {
    renderBus();
    renderGates();
    renderExprLab(currentExpr);
  }

  function wire() {
    EXPR_EL = document.getElementById('exprInput');
    STATUS_EL = document.getElementById('parseStatus');
    TRUTH_EL = document.getElementById('truthWrap');
    KMAP_EL = document.getElementById('kmapWrap');
    PI_EL = document.getElementById('piChips');
    SIMP_EL = document.getElementById('simpWrap');

    document.getElementById('bus').addEventListener('click', function (e) {
      var el = e.target.closest('.ioswitch');
      if (!el) return;
      var v = el.getAttribute('data-var');
      inputs[v] = inputs[v] ? 0 : 1;
      refresh();
    });
    document.getElementById('bus').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.closest('.ioswitch');
      if (!el) return;
      e.preventDefault();
      var v = el.getAttribute('data-var');
      inputs[v] = inputs[v] ? 0 : 1;
      refresh();
    });

    document.getElementById('exprGo').addEventListener('click', function () {
      renderExprLab(EXPR_EL.value);
    });
    EXPR_EL.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') renderExprLab(EXPR_EL.value);
    });

    var EXAMPLES = ['A\u00B7B + \u00ACC', '(A+B)\u00B7(\u00ACA+C)', 'A \u2295 B', "A'B + AB'", 'A + A\u00B7B + \u00ACA\u00B7B', '\u00AC(A\u00B7B) + C'];
    var exHtml = '';
    EXAMPLES.forEach(function (x) { exHtml += '<span class="chip" data-ex="' + esc(x) + '">' + esc(x) + '</span>'; });
    document.getElementById('examples').innerHTML = exHtml;
    document.getElementById('examples').addEventListener('click', function (e) {
      var el = e.target.closest('.chip');
      if (!el) return;
      EXPR_EL.value = el.getAttribute('data-ex');
      renderExprLab(EXPR_EL.value);
    });

    renderLawSeg();
    document.getElementById('lawSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      renderLaw(parseInt(b.getAttribute('data-law'), 10));
    });
  }

  function init() {
    wire();
    refresh();
    renderLaw(0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
