/* Hero background: a rotating set of live simulations, one per research area.
     01 IO          platform competition with royalty enforcement
     02 Metrics     demand estimation as data arrives
     03 Credit      borrowers flowing through a Bayesian network
     04 Games       replicator dynamics with prospect-theory loss aversion
     05 Causal      randomized experiments with spillovers on a network
   Each scene implements: init, layout, enter, step, draw, readout, onClick, clickable. */
(function () {
  'use strict';

  var canvas = document.querySelector('[data-hero-canvas]');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var hero = canvas.parentElement;
  var reduce = window.Site && window.Site.reduce;

  var ROSE = [224, 90, 112], AMB = [245, 177, 76], IVORY = [236, 226, 229], DIM = [176, 158, 163];
  var DURATION = 900;   // frames per scene (~15 s)
  var FADE = 45;        // crossfade frames

  var W = 0, H = 0, dpr = 1, s = 1, ambient = false, BASE = 1, G = 1;
  var box = { x: 0, y: 0, w: 1, h: 1 };
  var frame = 0;
  var mouse = { x: -9999, y: -9999, in: false };

  /* ---------- helpers ---------- */
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function gumbel() { return -Math.log(-Math.log(Math.random() * 0.999 + 0.0005)); }
  function randn() { return Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random()); }
  function bx(u) { return box.x + u * box.w; }
  function by(v) { return box.y + v * box.h; }
  function alpha(a) { ctx.globalAlpha = G * a; }
  function font(px, weight) { ctx.font = (weight || 400) + ' ' + Math.round(px) + 'px "JetBrains Mono", monospace'; }
  function text(str, x, y, col, a, align, px) {
    font(px || 10);
    ctx.fillStyle = rgba(col, a);
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  function circle(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.fill(); }
  function line(x1, y1, x2, y2, stroke, w) { ctx.strokeStyle = stroke; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function quad(a, c, b, t) { var u = 1 - t; return u * u * a + 2 * u * t * c + t * t * b; }
  function inBox(x, y) { return x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h; }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function trail(h, col, a, w) {
    if (h.length < 4) return;
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = w || 1;
    ctx.beginPath(); ctx.moveTo(h[0], h[1]);
    for (var i = 2; i < h.length; i += 2) ctx.lineTo(h[i], h[i + 1]);
    ctx.stroke();
  }

  /* least squares: X is an array of rows, returns coefficients (small k only) */
  function ols(X, y) {
    var k = X[0].length, A = [], i, j, r;
    for (i = 0; i < k; i++) { A.push(new Array(k + 1).fill(0)); }
    for (r = 0; r < X.length; r++) {
      for (i = 0; i < k; i++) {
        for (j = 0; j < k; j++) A[i][j] += X[r][i] * X[r][j];
        A[i][k] += X[r][i] * y[r];
      }
    }
    for (i = 0; i < k; i++) {
      var piv = i;
      for (r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      var tmp = A[i]; A[i] = A[piv]; A[piv] = tmp;
      if (Math.abs(A[i][i]) < 1e-9) return null;
      for (r = 0; r < k; r++) {
        if (r === i) continue;
        var f = A[r][i] / A[i][i];
        for (j = i; j <= k; j++) A[r][j] -= f * A[i][j];
      }
    }
    return A.map(function (row, idx) { return row[k] / row[idx]; });
  }

  /* =======================================================================
     01 · Platform competition with royalty enforcement
     ======================================================================= */
  var platformsScene = (function () {
    var BASE_FEE = 0.02, ROYALTY = 0.05;
    var PARAMS = {
      spec: { fee: 38, enforce: 0, net: 1.4, switching: 0.5 },  // speculators chase low fees
      col: { fee: 10, enforce: 1.1, net: 1.0, switching: 0.9 }  // collectors value enforcement
    };
    var plats = [
      { id: 'A', col: ROSE, enforce: true, dir: 1, flash: 0, u: 0.16, v: 0.67 },
      { id: 'B', col: AMB, enforce: false, dir: -1, flash: 0, u: 0.77, v: 0.67 },
      { id: 'C', col: IVORY, enforce: true, dir: 1, flash: 0, u: 0.48, v: 0.13 }
    ];
    var creator = { u: 0.47, v: 0.49, x: 0, y: 0, pulse: 0 };
    var traders = [], ripples = [], coins = [], hhiHist = [];
    var switches = 0, royalties = 0, intro = 0, t = 0, nextEvent = 420, hovered = -1;
    var sc = { event: 'Platforms A and C enforce royalties' };

    function fee(p) { return BASE_FEE + (p.enforce ? ROYALTY : 0); }
    function hhi() { return plats.reduce(function (a, p) { return a + Math.pow((p.share || 0) * 100, 2); }, 0); }

    function orbit(tr) {
      var p = plats[tr.p];
      var R = s * (22 + tr.rr * (30 + 100 * Math.sqrt(p.share === undefined ? 0.33 : p.share)));
      return [p.x + Math.cos(tr.th) * R, p.y + Math.sin(tr.th) * R * 0.8];
    }
    function startMove(tr, to, dur, fx, fy) {
      var from = tr.p;
      tr.p = to;
      var end = orbit(tr);
      var sx = fx === undefined ? tr.x : fx, sy = fy === undefined ? tr.y : fy;
      var dx = end[0] - sx, dy = end[1] - sy;
      var bend = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.2);
      tr.move = { sx: sx, sy: sy, cx: (sx + end[0]) / 2 - dy * bend, cy: (sy + end[1]) / 2 + dx * bend, t: 0, dur: dur || 80 + Math.random() * 50, from: from };
    }
    function choose(tr) {
      var k = PARAMS[tr.type], best = tr.p, bestU = -Infinity;
      plats.forEach(function (p, j) {
        var u = -k.fee * fee(p) + k.enforce * (p.enforce ? 1 : 0) + k.net * (p.share || 0) -
          (j === tr.p ? 0 : k.switching) + gumbel() * 0.55;
        if (u > bestU) { bestU = u; best = j; }
      });
      if (best !== tr.p) { startMove(tr, best); switches++; }
    }
    function toggle(i, byUser) {
      var p = plats[i];
      p.enforce = !p.enforce;
      p.flash = 1;
      sc.event = byUser
        ? 'You set Platform ' + p.id + ' to ' + (p.enforce ? 'enforce royalties' : 'optional royalties')
        : 'Platform ' + p.id + (p.enforce ? ' starts enforcing royalties' : ' drops royalty enforcement');
    }
    function hubAt(x, y) {
      for (var j = 0; j < plats.length; j++) {
        var dx = x - plats[j].x, dy = y - plats[j].y;
        if (dx * dx + dy * dy < Math.pow(30 * s, 2)) return j;
      }
      return -1;
    }

    sc.key = 'io';
    sc.title = 'Platform competition';
    sc.hint = '● collector ◆ speculator · click a platform to toggle royalty enforcement';
    sc.init = function () {
      var n = ambient ? 80 : 130;
      traders = [];
      for (var i = 0; i < n; i++) {
        traders.push({
          type: Math.random() < 0.6 ? 'spec' : 'col', p: Math.floor(Math.random() * 3),
          th: Math.random() * Math.PI * 2, rr: 0.25 + Math.random() * 0.75, w: 0.004 + Math.random() * 0.007,
          x: 0, y: 0, ox: 0, oy: 0, hist: [], move: null, flash: 0
        });
      }
    };
    sc.layout = function () {
      plats.forEach(function (p) { p.x = bx(p.u); p.y = by(p.v); });
      creator.x = bx(creator.u); creator.y = by(creator.v);
    };
    sc.enter = function () {
      intro = 0;
      ripples = []; coins = [];
      traders.forEach(function (tr) { tr.hist = []; startMove(tr, tr.p, 50 + Math.random() * 110, creator.x, creator.y); });
      nextEvent = t + 420;
    };
    sc.step = function () {
      t++;
      if (intro < 1) intro = Math.min(1, intro + 0.012);
      var counts = [0, 0, 0];
      traders.forEach(function (tr) { counts[tr.p]++; });
      plats.forEach(function (p, j) {
        var sh = counts[j] / traders.length;
        p.share = p.share === undefined ? sh : p.share + (sh - p.share) * 0.05;
        if (p.flash) p.flash = Math.max(0, p.flash - 0.02);
      });
      if (t >= nextEvent && intro >= 1) {
        toggle(Math.floor(Math.random() * 3), false);
        nextEvent = t + 480 + Math.floor(Math.random() * 300);
      }
      hovered = mouse.in ? hubAt(mouse.x, mouse.y) : -1;

      traders.forEach(function (tr) {
        tr.th += tr.w * plats[tr.p].dir;
        var pos;
        if (tr.move) {
          var m = tr.move;
          m.t += 1 / m.dur;
          if (m.t >= 1) { tr.move = null; pos = orbit(tr); }
          else { var e = ease(m.t), end = orbit(tr); pos = [quad(m.sx, m.cx, end[0], e), quad(m.sy, m.cy, end[1], e)]; }
        } else {
          pos = orbit(tr);
          if (intro >= 1 && Math.random() < 0.0014) choose(tr);
        }
        if (mouse.in) {
          var dx = pos[0] + tr.ox - mouse.x, dy = pos[1] + tr.oy - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < 8100 && d2 > 1) { var d = Math.sqrt(d2), f = (90 - d) / 90 * 2.2; tr.ox += dx / d * f; tr.oy += dy / d * f; }
        }
        tr.ox *= 0.93; tr.oy *= 0.93;
        tr.x = pos[0] + tr.ox; tr.y = pos[1] + tr.oy;
        tr.hist.push(tr.x, tr.y);
        var keep = tr.move ? 28 : 10;
        while (tr.hist.length > keep) tr.hist.splice(0, 2);
        if (tr.flash > 0) tr.flash -= 0.04;
      });

      if (intro >= 1) {
        plats.forEach(function (p, j) {
          if (Math.random() > 0.025 + 0.09 * p.share) return;
          for (var k = 0; k < 12; k++) {
            var tr = traders[Math.floor(Math.random() * traders.length)];
            if (tr.p !== j || tr.move) continue;
            tr.flash = 1;
            ripples.push({ x: tr.x, y: tr.y, col: p.col, t: 0 });
            if (p.enforce) {
              coins.push({ sx: tr.x, sy: tr.y, cx: (tr.x + creator.x) / 2 + (Math.random() - 0.5) * 80, cy: (tr.y + creator.y) / 2 - 30 - Math.random() * 40, t: 0, v: 0.2 + Math.random() * 1.8 });
            }
            return;
          }
        });
      }
      for (var i = ripples.length - 1; i >= 0; i--) { ripples[i].t += 0.035; if (ripples[i].t >= 1) ripples.splice(i, 1); }
      for (i = coins.length - 1; i >= 0; i--) {
        coins[i].t += 0.018;
        if (coins[i].t >= 1) { royalties += coins[i].v * ROYALTY; creator.pulse = 1; coins.splice(i, 1); }
      }
      if (creator.pulse > 0) creator.pulse = Math.max(0, creator.pulse - 0.04);
      if (t % 30 === 0) { hhiHist.push(hhi()); if (hhiHist.length > 40) hhiHist.shift(); }
    };
    sc.draw = function () {
      var a = intro, i;
      ctx.lineWidth = 1;
      plats.forEach(function (p) {
        ctx.setLineDash(p.enforce ? [3, 7] : [1, 9]);
        ctx.lineDashOffset = p.enforce ? -t * 0.4 : 0;
        line(p.x, p.y, creator.x, creator.y, p.enforce ? rgba(AMB, 0.28 * a) : rgba(DIM, 0.07 * a));
      });
      ctx.setLineDash([]);

      traders.forEach(function (tr) {
        var col = plats[tr.p].col;
        if (tr.move) col = mix(plats[tr.move.from].col, col, ease(tr.move.t));
        trail(tr.hist, col, tr.move ? 0.5 : 0.16, tr.move ? 1.4 : 1);
        var r = (tr.type === 'col' ? 1.9 : 1.6) * (1 + Math.max(0, tr.flash) * 1.4);
        if (tr.flash > 0) circle(tr.x, tr.y, r * 4, rgba(col, 0.18 * tr.flash));
        ctx.fillStyle = rgba(col, (tr.move ? 0.95 : 0.7) + Math.max(0, tr.flash) * 0.3);
        ctx.beginPath();
        if (tr.type === 'col') ctx.arc(tr.x, tr.y, r, 0, Math.PI * 2);
        else { var q = r * 1.35; ctx.moveTo(tr.x, tr.y - q); ctx.lineTo(tr.x + q, tr.y); ctx.lineTo(tr.x, tr.y + q); ctx.lineTo(tr.x - q, tr.y); ctx.closePath(); }
        ctx.fill();
      });

      ripples.forEach(function (rp) {
        ctx.strokeStyle = rgba(rp.col, (1 - rp.t) * 0.55); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, 3 + rp.t * 16, 0, Math.PI * 2); ctx.stroke();
      });
      coins.forEach(function (c) {
        var e = ease(c.t), x = quad(c.sx, c.cx, creator.x, e), y = quad(c.sy, c.cy, creator.y, e);
        circle(x, y, 5, rgba(AMB, 0.22));
        circle(x, y, 1.9, rgba(AMB, 1));
      });

      plats.forEach(function (p, j) {
        var core = s * (j === hovered ? 15 : 12) * a, ring = core + 9 * s, share = p.share || 0;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, ring * 3.2));
        g.addColorStop(0, rgba(p.col, 0.22 + p.flash * 0.3));
        g.addColorStop(1, rgba(p.col, 0));
        circle(p.x, p.y, ring * 3.2, g);
        ctx.lineWidth = 2.5 * s;
        ctx.strokeStyle = rgba(DIM, 0.14);
        ctx.beginPath(); ctx.arc(p.x, p.y, ring, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = rgba(p.col, 0.95);
        ctx.beginPath(); ctx.arc(p.x, p.y, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share * a); ctx.stroke();
        circle(p.x, p.y, core, '#0a0708');
        ctx.lineWidth = 1.5;
        ctx.setLineDash(p.enforce ? [] : [3, 3]);
        ctx.strokeStyle = rgba(p.col, 1);
        ctx.beginPath(); ctx.arc(p.x, p.y, core, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        if (a > 0.6) {
          alpha((a - 0.6) / 0.4);
          text(p.id, p.x, p.y + 0.5, p.col, 1, 'center', 11 * Math.max(s, 0.8));
          if (!ambient) {
            text((p.enforce ? 'enforced · ' : 'optional · ') + (fee(p) * 100).toFixed(0) + '% fee', p.x, p.y + ring + 16, IVORY, 0.55);
            text(Math.round(share * 100) + '%', p.x, p.y - ring - 12, p.col, 0.9);
          }
          alpha(1);
        }
      });

      var cr = 7 * s * a * (1 + creator.pulse * 0.35);
      if (creator.pulse > 0) {
        ctx.strokeStyle = rgba(AMB, creator.pulse * 0.6); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(creator.x, creator.y, cr + (1 - creator.pulse) * 22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = rgba(AMB, 0.95);
      ctx.beginPath();
      for (i = 0; i < 6; i++) {
        var ang = Math.PI / 6 + i * Math.PI / 3;
        ctx[i ? 'lineTo' : 'moveTo'](creator.x + Math.cos(ang) * cr, creator.y + Math.sin(ang) * cr);
      }
      ctx.closePath(); ctx.fill();
      if (a > 0.6 && !ambient) text('creator · Ξ' + royalties.toFixed(2), creator.x, creator.y + cr + 16, AMB, 0.8);
    };
    sc.readout = function () {
      return {
        bars: plats.map(function (p) { return { label: p.id, col: p.col, value: p.share || 0, text: pct(p.share || 0), tag: p.enforce ? 'enforced' : 'optional', on: p.enforce }; }),
        stats: [['HHI', Math.round(hhi()).toLocaleString()], ['switches', switches.toLocaleString()], ['royalties to creator', 'Ξ' + royalties.toFixed(2), true]],
        spark: { data: hhiHist, lo: 3333, hi: 10000, label: 'HHI' }
      };
    };
    sc.clickable = function (x, y) { return hubAt(x, y) > -1; };
    sc.onClick = function (x, y) {
      var j = hubAt(x, y);
      if (j < 0) return false;
      toggle(j, true);
      nextEvent = t + 600;
      return true;
    };
    return sc;
  })();

  /* =======================================================================
     02 · Demand estimation: OLS in logs as market data arrives
     ======================================================================= */
  var metricsScene = (function () {
    var PMIN = 1, PMAX = 8, QMAX = 45, AQ = 40, SIGMA = 0.22, NMAX = 110;
    var pts = [], boots = [], hist = [], trueEps = 1.5, fit = null, t = 0, hold = 0;
    var sc = { event: 'Estimating a demand elasticity by OLS in logs' };

    function X(p) { return bx(0.1) + (p - PMIN) / (PMAX - PMIN) * (bx(0.95) - bx(0.1)); }
    function Y(q) { return by(0.88) - clamp(q, 0, QMAX) / QMAX * (by(0.88) - by(0.08)); }

    function estimate(data) {
      var n = data.length;
      if (n < 3) return null;
      var mx = 0, my = 0, i;
      for (i = 0; i < n; i++) { mx += data[i].lx; my += data[i].ly; }
      mx /= n; my /= n;
      var sxx = 0, sxy = 0, syy = 0;
      for (i = 0; i < n; i++) {
        var dx = data[i].lx - mx, dy = data[i].ly - my;
        sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
      }
      var b = sxy / sxx, a = my - b * mx, ssr = 0;
      for (i = 0; i < n; i++) { var e = data[i].ly - a - b * data[i].lx; ssr += e * e; }
      var sig2 = ssr / Math.max(1, n - 2);
      return { a: a, b: b, se: Math.sqrt(sig2 / sxx), sig: Math.sqrt(sig2), mx: mx, sxx: sxx, n: n, r2: 1 - ssr / syy };
    }
    function addPoint(fast) {
      var p = PMIN + Math.random() * (PMAX - PMIN);
      var q = AQ * Math.pow(p, -trueEps) * Math.exp(SIGMA * randn());
      pts.push({ p: p, q: q, lx: Math.log(p), ly: Math.log(q), t: fast ? 0.3 : 0, ring: 0 });
    }
    function newMarket(first) {
      pts = []; boots = []; hist = []; fit = null; hold = 0;
      trueEps = Math.round((1.1 + Math.random() * 1.0) * 100) / 100;
      if (!first) sc.event = 'New market drawn · true ε = ' + trueEps.toFixed(2);
    }
    function curvePath(a, b) {
      ctx.beginPath();
      for (var k = 0; k <= 60; k++) {
        var p = PMIN + (PMAX - PMIN) * k / 60, q = Math.exp(a + b * Math.log(p));
        ctx[k ? 'lineTo' : 'moveTo'](X(p), Y(q));
      }
    }

    sc.key = 'metrics';
    sc.title = 'Demand estimation';
    sc.hint = 'log q = α − ε log p + u · click to sample more markets';
    sc.init = function () { newMarket(true); };
    sc.layout = function () {};
    sc.enter = function () { newMarket(true); sc.event = 'Estimating a demand elasticity by OLS in logs'; };
    sc.step = function () {
      t++;
      if (pts.length < NMAX) { if (t % 9 === 0) addPoint(false); }
      else if (++hold > 150) newMarket(false);
      pts.forEach(function (d) {
        if (d.t < 1) { d.t = Math.min(1, d.t + 0.04); if (d.t === 1) d.ring = 1; }
        else if (d.ring > 0) d.ring = Math.max(0, d.ring - 0.04);
      });
      var landed = pts.filter(function (d) { return d.t >= 1; });
      var f = estimate(landed);
      if (f) {
        fit = f;
        if (t % 9 === 0) { hist.push(-f.b); if (hist.length > 40) hist.shift(); }
        if (t % 22 === 0 && landed.length > 8) {
          var sample = [];
          for (var k = 0; k < landed.length; k++) sample.push(landed[Math.floor(Math.random() * landed.length)]);
          var bf = estimate(sample);
          if (bf) { boots.push({ a: bf.a, b: bf.b, life: 1 }); if (boots.length > 10) boots.shift(); }
        }
      }
      boots.forEach(function (bt) { bt.life = Math.max(0, bt.life - 0.006); });
    };
    sc.draw = function () {
      var x0 = bx(0.1), x1 = bx(0.95), y0 = by(0.08), y1 = by(0.88), k;
      for (k = 1; k <= 3; k++) {
        ctx.setLineDash([2, 5]);
        line(x0, y1 - (y1 - y0) * k / 4, x1, y1 - (y1 - y0) * k / 4, rgba(DIM, 0.12));
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(DIM, 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
      if (!ambient) {
        text('quantity', x0, y0 - 12, DIM, 0.7, 'left');
        text('price →', x1, y1 + 14, DIM, 0.7, 'right');
      }

      // true curve
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = rgba(IVORY, 0.32); ctx.lineWidth = 1.2;
      curvePath(Math.log(AQ), -trueEps); ctx.stroke();
      ctx.setLineDash([]);

      if (fit) {
        // confidence band for the mean (log scale, mapped back)
        ctx.fillStyle = rgba(ROSE, 0.1);
        ctx.beginPath();
        for (k = 0; k <= 40; k++) {
          var p = PMIN + (PMAX - PMIN) * k / 40, lx = Math.log(p);
          var se = fit.sig * Math.sqrt(1 / fit.n + Math.pow(lx - fit.mx, 2) / fit.sxx);
          ctx[k ? 'lineTo' : 'moveTo'](X(p), Y(Math.exp(fit.a + fit.b * lx + 1.96 * se)));
        }
        for (k = 40; k >= 0; k--) {
          var p2 = PMIN + (PMAX - PMIN) * k / 40, lx2 = Math.log(p2);
          var se2 = fit.sig * Math.sqrt(1 / fit.n + Math.pow(lx2 - fit.mx, 2) / fit.sxx);
          ctx.lineTo(X(p2), Y(Math.exp(fit.a + fit.b * lx2 - 1.96 * se2)));
        }
        ctx.closePath(); ctx.fill();

        boots.forEach(function (bt) {
          ctx.strokeStyle = rgba(ROSE, 0.22 * bt.life); ctx.lineWidth = 1;
          curvePath(bt.a, bt.b); ctx.stroke();
        });
      }

      pts.forEach(function (d) {
        var x = X(d.p), yT = Y(d.q), y = d.t < 1 ? quad(y0 - 30, y0, yT, ease(d.t)) : yT;
        if (d.ring > 0) {
          ctx.strokeStyle = rgba(AMB, d.ring * 0.6); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 2 + (1 - d.ring) * 10, 0, Math.PI * 2); ctx.stroke();
        }
        circle(x, y, 2.2, rgba(d.t < 1 ? AMB : IVORY, d.t < 1 ? 0.9 : 0.7));
      });

      if (fit) {
        ctx.save();
        ctx.shadowColor = rgba(ROSE, 0.7); ctx.shadowBlur = 8;
        ctx.strokeStyle = rgba(ROSE, 1); ctx.lineWidth = 2.2;
        curvePath(fit.a, fit.b); ctx.stroke();
        ctx.restore();
        if (!ambient) {
          text('D̂', X(PMAX) + 10, Y(Math.exp(fit.a + fit.b * Math.log(PMAX))), ROSE, 1, 'left', 11);
          text('true D', X(PMAX * 0.22 + 0.5), Y(AQ * Math.pow(PMAX * 0.22 + 0.5, -trueEps)) - 14, IVORY, 0.55, 'left');
        }
      }
    };
    sc.readout = function () {
      var f = fit;
      return {
        stats: [
          ['ε̂', f ? (-f.b).toFixed(2) + ' ± ' + f.se.toFixed(2) : '…'],
          ['true ε', trueEps.toFixed(2)],
          ['n · R²', f ? f.n + ' · ' + f.r2.toFixed(2) : '…']
        ],
        spark: { data: hist, label: 'ε̂' }
      };
    };
    sc.clickable = function (x, y) { return inBox(x, y); };
    sc.onClick = function (x, y) {
      if (!inBox(x, y)) return false;
      if (pts.length >= NMAX) newMarket(false);
      for (var k = 0; k < 12; k++) addPoint(true);
      sc.event = 'Sampled 12 more markets';
      return true;
    };
    return sc;
  })();

  /* =======================================================================
     03 · Credit risk: borrowers flowing through a Bayesian network
     ======================================================================= */
  var creditScene = (function () {
    var nodes = {
      income: { u: 0.14, v: 0.22, label: 'income', good: 'high', bad: 'low' },
      score: { u: 0.14, v: 0.74, label: 'credit score', good: 'good', bad: 'poor' },
      usage: { u: 0.42, v: 0.48, label: 'BNPL usage', good: 'light', bad: 'heavy' },
      missed: { u: 0.67, v: 0.48, label: 'missed pmt', good: 'no', bad: 'yes' }
    };
    var buckets = { repay: { u: 0.91, v: 0.24, label: 'repay', col: IVORY, n: 0, dots: [] }, def: { u: 0.91, v: 0.74, label: 'default', col: AMB, n: 0, dots: [] } };
    var edges = [['income', 'score'], ['income', 'usage'], ['score', 'missed'], ['usage', 'missed'], ['missed', 'repay'], ['missed', 'def'], ['score', 'def']];
    var order = ['income', 'score', 'usage', 'missed'];
    var people = [], t = 0, shock = 0, nextShock = 600, hist = [];
    var ema = { income: 0.35, usage: 0.4, missed: 0.2, def: 0.08 };
    var c = { total: 0, def: 0, miss: 0, defMiss: 0, noMiss: 0, defNoMiss: 0 };
    var sc = { event: 'Borrowers arrive; each node is a conditional distribution' };

    function pos(key) { var n = nodes[key] || buckets[key]; return [bx(n.u), by(n.v)]; }
    function slot(key, bad) { var p = pos(key); return [p[0], p[1] + (bad ? 9 : -9) * s]; }

    function spawn() {
      var lowInc = Math.random() < 0.35 + (shock > 0 ? 0.3 : 0);
      var poor = Math.random() < (lowInc ? 0.55 : 0.2);
      var heavy = Math.random() < (lowInc ? 0.6 : 0.3);
      var miss = Math.random() < 0.05 + 0.25 * heavy + 0.25 * poor;
      var dflt = Math.random() < (miss ? 0.35 + 0.2 * poor : 0.03 + 0.05 * poor);
      var states = { income: lowInc, score: poor, usage: heavy, missed: miss };
      var path = [[box.x - 10, by(0.48)]];
      order.forEach(function (k) { path.push(slot(k, states[k])); });
      var b = pos(dflt ? 'def' : 'repay');
      path.push([b[0] + (Math.random() - 0.5) * 30 * s, b[1] + (Math.random() - 0.5) * 30 * s]);
      people.push({ states: states, dflt: dflt, path: path, seg: 0, t: 0, x: path[0][0], y: path[0][1], bad: 0, hist: [] });
    }
    function finish(p) {
      var st = p.states;
      c.total++;
      if (p.dflt) c.def++;
      if (st.missed) { c.miss++; if (p.dflt) c.defMiss++; } else { c.noMiss++; if (p.dflt) c.defNoMiss++; }
      ema.income = ema.income * 0.97 + 0.03 * st.income;
      ema.usage = ema.usage * 0.97 + 0.03 * st.usage;
      ema.missed = ema.missed * 0.97 + 0.03 * st.missed;
      ema.def = ema.def * 0.97 + 0.03 * p.dflt;
      var bk = p.dflt ? buckets.def : buckets.repay;
      bk.n++;
      bk.dots.push({ x: p.x, y: p.y, life: 1 });
      if (bk.dots.length > 70) bk.dots.shift();
    }
    function startShock(byUser) {
      shock = 420;
      sc.event = (byUser ? 'You triggered an income shock' : 'Income shock') + ' · P(low income) 35% → 65%';
    }

    sc.key = 'credit';
    sc.title = 'Credit risk network';
    sc.hint = 'dynamic Bayesian network for BNPL credit risk · click to trigger an income shock';
    sc.init = function () {};
    sc.layout = function () {};
    sc.enter = function () {
      people = []; shock = 0; nextShock = t + 540;
      sc.event = 'Borrowers arrive; each node is a conditional distribution';
    };
    sc.step = function () {
      t++;
      if (t % (ambient ? 10 : 6) === 0 && people.length < 70) spawn();
      if (shock > 0 && --shock === 0) sc.event = 'Shock fades · incomes recover';
      if (t >= nextShock) { startShock(false); nextShock = t + 900 + Math.floor(Math.random() * 300); }
      for (var i = people.length - 1; i >= 0; i--) {
        var p = people[i];
        p.t += 1 / 26;
        if (p.t >= 1) {
          p.t = 0; p.seg++;
          if (p.seg >= 1 && p.seg <= order.length && p.states[order[p.seg - 1]]) p.bad++;
          if (p.seg >= p.path.length - 1) { p.x = p.path[p.path.length - 1][0]; p.y = p.path[p.path.length - 1][1]; finish(p); people.splice(i, 1); continue; }
        }
        var a = p.path[p.seg], b = p.path[p.seg + 1], e = ease(p.t);
        var cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2 - 18 * s;
        p.x = quad(a[0], cx, b[0], e); p.y = quad(a[1], cy, b[1], e);
        p.hist.push(p.x, p.y);
        if (p.hist.length > 16) p.hist.splice(0, 2);
      }
      ['repay', 'def'].forEach(function (k) {
        buckets[k].dots.forEach(function (d) { d.life = Math.max(0, d.life - 0.004); });
      });
      if (t % 20 === 0 && c.total > 5) { hist.push(c.def / c.total); if (hist.length > 40) hist.shift(); }
    };
    sc.draw = function () {
      // edges
      edges.forEach(function (e) {
        var a = pos(e[0]), b = pos(e[1]);
        ctx.setLineDash(e[0] === 'score' && e[1] === 'def' ? [3, 5] : []);
        ctx.strokeStyle = rgba(DIM, 0.22); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 18 * s, b[0], b[1]); ctx.stroke();
      });
      ctx.setLineDash([]);

      // nodes
      var rates = { income: ema.income, score: null, usage: ema.usage, missed: ema.missed };
      Object.keys(nodes).forEach(function (k) {
        var n = nodes[k], p = pos(k), w = 84 * s, h = 38 * s;
        var hot = k === 'income' && shock > 0;
        ctx.fillStyle = 'rgba(16,11,13,0.92)';
        ctx.strokeStyle = rgba(hot ? AMB : ROSE, hot ? 0.9 : 0.75); ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.roundRect(p[0] - w / 2, p[1] - h / 2, w, h, 7 * s); ctx.fill(); ctx.stroke();
        line(p[0] - w / 2 + 6, p[1], p[0] + w / 2 - 6, p[1], rgba(DIM, 0.18));
        if (!ambient) {
          text(n.label, p[0], p[1] - h / 2 - 11, IVORY, 0.75);
          text(n.good, p[0] + w / 2 - 8, p[1] - 9 * s, DIM, 0.6, 'right', 9);
          text(n.bad, p[0] + w / 2 - 8, p[1] + 9 * s, AMB, 0.75, 'right', 9);
          if (rates[k] !== null && rates[k] !== undefined) {
            ctx.fillStyle = rgba(AMB, 0.7);
            ctx.fillRect(p[0] - w / 2, p[1] + h / 2 + 4, w * rates[k], 2);
          }
        }
      });

      // borrowers
      people.forEach(function (p) {
        var col = mix(IVORY, AMB, Math.min(1, p.bad / 2));
        trail(p.hist, col, 0.35, 1.2);
        circle(p.x, p.y, 2.3, rgba(col, 0.95));
      });

      // buckets
      ['repay', 'def'].forEach(function (k) {
        var bk = buckets[k], p = pos(k), w = 54 * s, h = 64 * s;
        ctx.strokeStyle = rgba(bk.col, 0.55); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p[0] - w / 2, p[1] - h / 2); ctx.lineTo(p[0] - w / 2, p[1] + h / 2);
        ctx.lineTo(p[0] + w / 2, p[1] + h / 2); ctx.lineTo(p[0] + w / 2, p[1] - h / 2); ctx.stroke();
        bk.dots.forEach(function (d) { circle(d.x, d.y, 2, rgba(bk.col, 0.15 + 0.6 * d.life)); });
        if (!ambient) text(bk.label + ' · ' + bk.n, p[0], p[1] + h / 2 + 13, bk.col, 0.8);
      });
    };
    sc.readout = function () {
      return {
        bars: [
          { label: 'low income', col: AMB, value: ema.income, text: pct(ema.income) },
          { label: 'missed pmt', col: AMB, value: ema.missed, text: pct(ema.missed) },
          { label: 'default', col: ROSE, value: ema.def, text: pct(ema.def) }
        ],
        stats: [
          ['borrowers', c.total.toLocaleString()],
          ['P(D | missed)', c.miss ? pct(c.defMiss / c.miss) : '…'],
          ['P(D | on time)', c.noMiss ? pct(c.defNoMiss / c.noMiss) : '…']
        ],
        spark: { data: hist, label: 'default rate' }
      };
    };
    sc.clickable = function (x, y) { return inBox(x, y); };
    sc.onClick = function (x, y) {
      if (!inBox(x, y)) return false;
      startShock(true);
      nextShock = t + 1200;
      return true;
    };
    return sc;
  })();

  /* =======================================================================
     04 · Replicator dynamics with prospect-theory loss aversion
     ======================================================================= */
  var gamesScene = (function () {
    var REGIMES = [
      { lam: 0.6, note: 'λ = 0.60 · play spirals into the mixed Nash equilibrium' },
      { lam: 1.0, note: 'λ = 1.00 · expected utility: neutral cycles around Nash' },
      { lam: 2.25, note: 'λ = 2.25 · loss aversion destabilizes Nash, play spirals out' }
    ];
    var NAMES = ['rock', 'paper', 'scissors'], COLS = [ROSE, AMB, IVORY];
    var pops = [], reg = 0, lam = 0.6, t = 0, nextReg = 330, hist = [];
    var V = [[0, 0], [0, 0], [0, 0]], cx = 0, cy = 0, R = 1;
    var sc = { event: REGIMES[0].note };

    function toXY(x) { return [x[0] * V[0][0] + x[1] * V[1][0] + x[2] * V[2][0], x[0] * V[0][1] + x[1] * V[1][1] + x[2] * V[2][1]]; }
    function newPop() {
      var x = [1 / 3 + randn() * 0.13, 1 / 3 + randn() * 0.13, 1 / 3 + randn() * 0.13].map(function (v) { return Math.max(0.03, v); });
      var sum = x[0] + x[1] + x[2];
      return { x: x.map(function (v) { return v / sum; }), hist: [], age: 0, life: 0 };
    }
    function setRegime(i) { reg = i; sc.event = REGIMES[i].note; }
    function dist(x) { return Math.sqrt(Math.pow(x[0] - 1 / 3, 2) + Math.pow(x[1] - 1 / 3, 2) + Math.pow(x[2] - 1 / 3, 2)); }

    sc.key = 'games';
    sc.title = 'Behavioral games';
    sc.hint = 'replicator dynamics · win +1, loss −λ (prospect theory) · click to change λ';
    sc.init = function () { pops = []; for (var i = 0; i < (ambient ? 26 : 38); i++) pops.push(newPop()); };
    sc.layout = function () {
      R = Math.min(box.h * 0.47, box.w * 0.34);
      cx = bx(0.36); cy = by(0.56);
      V = [[cx, cy - R], [cx - R * 0.866, cy + R / 2], [cx + R * 0.866, cy + R / 2]];
    };
    sc.enter = function () { setRegime(0); lam = REGIMES[0].lam; nextReg = t + 330; sc.init(); };
    sc.step = function () {
      t++;
      if (t >= nextReg) { setRegime((reg + 1) % REGIMES.length); nextReg = t + 330; }
      lam += (REGIMES[reg].lam - lam) * 0.04;
      // payoff matrix: win = +1, loss = -lambda
      var A = [[0, -lam, 1], [1, 0, -lam], [-lam, 1, 0]];
      pops.forEach(function (p, idx) {
        for (var k = 0; k < 2; k++) {
          var x = p.x, f = [0, 0, 0], phi = 0;
          for (var i = 0; i < 3; i++) { f[i] = A[i][0] * x[0] + A[i][1] * x[1] + A[i][2] * x[2]; phi += x[i] * f[i]; }
          for (i = 0; i < 3; i++) x[i] = Math.max(1e-4, x[i] + 0.022 * x[i] * (f[i] - phi));
          var sum = x[0] + x[1] + x[2];
          for (i = 0; i < 3; i++) x[i] /= sum;
        }
        p.age++;
        p.life = Math.min(1, p.life + 0.03);
        var xy = toXY(p.x);
        p.hist.push(xy[0], xy[1]);
        if (p.hist.length > 90) p.hist.splice(0, 2);
        if (Math.min(p.x[0], p.x[1], p.x[2]) < 0.006 || (dist(p.x) < 0.008 && p.age > 120) || p.age > 1400) pops[idx] = newPop();
      });
      if (t % 15 === 0) {
        var d = pops.reduce(function (a, p) { return a + dist(p.x); }, 0) / pops.length;
        hist.push(d); if (hist.length > 40) hist.shift();
      }
    };
    sc.draw = function () {
      // simplex
      ctx.strokeStyle = rgba(DIM, 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(V[0][0], V[0][1]); ctx.lineTo(V[1][0], V[1][1]); ctx.lineTo(V[2][0], V[2][1]); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([2, 5]);
      for (var i = 0; i < 3; i++) line(V[i][0], V[i][1], (V[(i + 1) % 3][0] + V[(i + 2) % 3][0]) / 2, (V[(i + 1) % 3][1] + V[(i + 2) % 3][1]) / 2, rgba(DIM, 0.1));
      ctx.setLineDash([]);
      for (i = 0; i < 3; i++) {
        circle(V[i][0], V[i][1], 3.5, rgba(COLS[i], 0.9));
        if (!ambient) text(NAMES[i], V[i][0] + (i === 0 ? 0 : i === 1 ? -10 : 10), V[i][1] + (i === 0 ? -14 : 14), COLS[i], 0.8, i === 0 ? 'center' : i === 1 ? 'right' : 'left');
      }
      pops.forEach(function (p) {
        var col = mix(mix(COLS[0], COLS[1], p.x[1] / (p.x[0] + p.x[1] + 1e-9)), COLS[2], p.x[2]);
        alpha(p.life);
        trail(p.hist, col, 0.35, 1.1);
        var xy = toXY(p.x);
        circle(xy[0], xy[1], 2.4, rgba(col, 0.95));
        alpha(1);
      });
      // Nash marker
      ctx.strokeStyle = rgba(IVORY, 0.8); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
      if (!ambient) text('Nash', cx + 9, cy - 9, IVORY, 0.7, 'left', 9);

      // prospect-theory value function inset
      if (!ambient) {
        var ix = bx(0.73), iy = by(0.12), iw = box.w * 0.24, ih = box.h * 0.36, ox = ix + iw / 2, oy = iy + ih / 2;
        ctx.fillStyle = 'rgba(16,11,13,0.85)'; ctx.strokeStyle = rgba(DIM, 0.25); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(ix - 8, iy - 22, iw + 16, ih + 38, 8); ctx.fill(); ctx.stroke();
        text('v(x) · λ = ' + lam.toFixed(2), ix, iy - 9, IVORY, 0.75, 'left', 9);
        line(ix, oy, ix + iw, oy, rgba(DIM, 0.35));
        line(ox, iy, ox, iy + ih, rgba(DIM, 0.35));
        ctx.save();
        ctx.shadowColor = rgba(ROSE, 0.6); ctx.shadowBlur = 6;
        ctx.strokeStyle = rgba(ROSE, 1); ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (var k = 0; k <= 40; k++) {
          var xv = -1 + 2 * k / 40, v = xv >= 0 ? Math.pow(xv, 0.88) : -lam * Math.pow(-xv, 0.88);
          ctx[k ? 'lineTo' : 'moveTo'](ox + xv * iw / 2, oy - clamp(v / 2.4, -1, 1) * ih / 2);
        }
        ctx.stroke();
        ctx.restore();
        text('gains', ix + iw, oy + 10, DIM, 0.6, 'right', 8);
        text('losses', ix, oy - 8, DIM, 0.6, 'left', 8);
      }
    };
    sc.readout = function () {
      var m = [0, 0, 0];
      pops.forEach(function (p) { for (var i = 0; i < 3; i++) m[i] += p.x[i] / pops.length; });
      var d = hist.length ? hist[hist.length - 1] : 0;
      return {
        bars: NAMES.map(function (n, i) { return { label: n, col: COLS[i], value: m[i], text: pct(m[i]) }; }),
        stats: [['λ (loss aversion)', lam.toFixed(2)], ['dist. to Nash', d.toFixed(3)], ['populations', pops.length]],
        spark: { data: hist, label: 'distance to Nash' }
      };
    };
    sc.clickable = function (x, y) { return inBox(x, y); };
    sc.onClick = function (x, y) {
      if (!inBox(x, y)) return false;
      setRegime((reg + 1) % REGIMES.length);
      nextReg = t + 600;
      return true;
    };
    return sc;
  })();

  /* =======================================================================
     05 · Causal inference under interference
     ======================================================================= */
  var causalScene = (function () {
    var TAU = 1.0, GAMMA = 0.8, PT = 0.3, ROUND = 230;
    var units = [], links = [], pulses = [], data = [], hist = [], t = 0, rt = 0, round = 0, est = null;
    var sc = { event: 'Units on a network; treatment spills over to neighbors' };

    function build() {
      units = []; links = [];
      var n = ambient ? 34 : 44, tries = 0;
      while (units.length < n && tries++ < 4000) {
        var u = 0.04 + Math.random() * 0.92, v = 0.06 + Math.random() * 0.88;
        var ok = units.every(function (o) { var dx = (o.u - u) * box.w, dy = (o.v - v) * box.h; return dx * dx + dy * dy > Math.pow(46 * s, 2); });
        if (ok) units.push({ u: u, v: v, T: 0, frac: 0, y: 0, show: 0, flash: 0, nb: [] });
      }
      units.forEach(function (a, i) {
        var near = units.map(function (b, j) { var dx = (a.u - b.u) * box.w, dy = (a.v - b.v) * box.h; return { j: j, d: dx * dx + dy * dy }; })
          .filter(function (o) { return o.j !== i; }).sort(function (p, q) { return p.d - q.d; }).slice(0, 3);
        near.forEach(function (o) {
          if (a.nb.indexOf(o.j) < 0) { a.nb.push(o.j); units[o.j].nb.push(i); links.push([i, o.j]); }
        });
      });
    }
    function assign(byUser) {
      round++; rt = 0; pulses = [];
      units.forEach(function (u) { u.T = Math.random() < PT ? 1 : 0; u.show = 0; u.flash = u.T; });
      var exposed = 0, treated = 0;
      units.forEach(function (u) {
        var k = u.nb.reduce(function (a, j) { return a + units[j].T; }, 0);
        u.frac = u.nb.length ? k / u.nb.length : 0;
        u.y = 0.4 + TAU * u.T + GAMMA * u.frac + 0.3 * randn();
        if (u.T) treated++; else if (k) exposed++;
      });
      units.forEach(function (u, i) {
        if (!u.T) return;
        u.nb.forEach(function (j) { pulses.push({ a: i, b: j, t: -Math.random() * 0.3 }); });
      });
      sc.event = (byUser ? 'Re-randomized · ' : 'Round ' + round + ' · ') + treated + ' treated, ' + exposed + ' controls exposed';
    }
    function analyze() {
      units.forEach(function (u) { data.push({ T: u.T, f: u.frac, y: u.y }); });
      if (data.length > 700) data.splice(0, data.length - 700);
      var b = ols(data.map(function (d) { return [1, d.T, d.f]; }), data.map(function (d) { return d.y; }));
      var mt = 0, nt = 0, mc = 0, nc = 0;
      data.forEach(function (d) { if (d.T) { mt += d.y; nt++; } else { mc += d.y; nc++; } });
      if (b) est = { tau: b[1], gamma: b[2], naive: nt && nc ? mt / nt - mc / nc : 0 };
      if (est) { hist.push(est.tau); if (hist.length > 40) hist.shift(); }
    }

    sc.key = 'causal';
    sc.title = 'Causal interference';
    sc.hint = 'Yᵢ = α + τTᵢ + γ·(treated share of neighbors) + ε · truth τ = 1.0, γ = 0.8 · click to re-randomize';
    sc.init = function () {};
    sc.layout = function () { build(); };
    sc.enter = function () { if (!units.length) build(); data = []; hist = []; round = 0; est = null; assign(false); };
    sc.step = function () {
      t++; rt++;
      if (rt === 130) analyze();
      if (rt >= ROUND) assign(false);
      pulses.forEach(function (p) { p.t += 0.02; });
      units.forEach(function (u) {
        if (rt > 70) u.show = Math.min(1, u.show + 0.04);
        if (u.flash > 0) u.flash = Math.max(0, u.flash - 0.02);
      });
    };
    sc.draw = function () {
      links.forEach(function (l) {
        var a = units[l[0]], b = units[l[1]];
        line(bx(a.u), by(a.v), bx(b.u), by(b.v), rgba(DIM, 0.16));
      });
      pulses.forEach(function (p) {
        if (p.t <= 0 || p.t >= 1) return;
        var a = units[p.a], b = units[p.b];
        var x = bx(a.u) + (bx(b.u) - bx(a.u)) * p.t, y = by(a.v) + (by(b.v) - by(a.v)) * p.t;
        circle(x, y, 4, rgba(AMB, 0.2));
        circle(x, y, 1.8, rgba(AMB, 0.95));
      });
      units.forEach(function (u) {
        var x = bx(u.u), y = by(u.v), base = 4 * s;
        if (u.show > 0) {
          ctx.strokeStyle = rgba(u.T ? ROSE : u.frac > 0 ? AMB : IVORY, 0.4 * u.show); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, base + Math.max(0, u.y) * 7 * s * ease(u.show), 0, Math.PI * 2); ctx.stroke();
        }
        if (u.T) {
          circle(x, y, base * 3 * (1 + u.flash), rgba(ROSE, 0.15 + 0.2 * u.flash));
          circle(x, y, base * 1.15, rgba(ROSE, 1));
        } else {
          circle(x, y, base * 0.85, rgba(u.frac > 0 && rt > 40 ? AMB : IVORY, u.frac > 0 && rt > 40 ? 0.9 : 0.55));
        }
      });
      if (!ambient) {
        var lx = bx(0.02), ly = by(1) + 4;
        circle(lx + 4, ly, 3.5, rgba(ROSE, 1)); text('treated', lx + 12, ly, IVORY, 0.6, 'left', 9);
        circle(lx + 76, ly, 3, rgba(AMB, 0.9)); text('exposed', lx + 84, ly, IVORY, 0.6, 'left', 9);
        circle(lx + 150, ly, 3, rgba(IVORY, 0.55)); text('pure control', lx + 158, ly, IVORY, 0.6, 'left', 9);
        text('ring size = outcome', bx(0.98), ly, DIM, 0.6, 'right', 9);
      }
    };
    sc.readout = function () {
      return {
        stats: [
          ['τ̂ direct', est ? est.tau.toFixed(2) : '…'],
          ['γ̂ spillover', est ? est.gamma.toFixed(2) : '…'],
          ['naive diff-in-means', est ? est.naive.toFixed(2) : '…']
        ],
        spark: { data: hist, label: 'τ̂' }
      };
    };
    sc.clickable = function (x, y) { return inBox(x, y); };
    sc.onClick = function (x, y) {
      if (!inBox(x, y)) return false;
      assign(true);
      return true;
    };
    return sc;
  })();

  /* =======================================================================
     Scene manager, readout panel, loop
     ======================================================================= */
  var scenes = [platformsScene, metricsScene, creditScene, gamesScene, causalScene];
  var current = 0, prev = -1, fade = 1, sceneT = 0, pauseUntil = 0, hoverPanel = false;
  var lastEvent = '';

  var panel = document.querySelector('.readout');
  var out = {
    tabs: document.querySelector('[data-readout="tabs"]'),
    title: document.querySelector('[data-readout="title"]'),
    bars: document.querySelector('[data-readout="bars"]'),
    stats: document.querySelector('[data-readout="stats"]'),
    spark: document.querySelector('[data-readout="spark"]'),
    sparkLabel: document.querySelector('[data-readout="spark-label"]'),
    event: document.querySelector('[data-readout="event"]'),
    hint: null
  };
  var tabs = [];
  if (out.tabs) {
    scenes.forEach(function (sc, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'readout__tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', sc.title);
      b.title = sc.title;
      b.innerHTML = '<span>0' + (i + 1) + '</span><i></i>';
      b.addEventListener('click', function () { go(i, true); });
      out.tabs.appendChild(b);
      tabs.push(b);
    });
  }
  if (panel) {
    panel.addEventListener('pointerenter', function () { hoverPanel = true; });
    panel.addEventListener('pointerleave', function () { hoverPanel = false; });
  }

  function esc(str) { return String(str).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }

  function renderReadout(force) {
    var sc = scenes[current], r = sc.readout();
    if (out.title) out.title.textContent = sc.title;
    if (out.bars) {
      out.bars.hidden = !r.bars;
      out.bars.innerHTML = (r.bars || []).map(function (b) {
        return '<li><span class="readout__id" style="color:' + rgba(b.col, 1) + '">' + esc(b.label) + '</span>' +
          '<span class="readout__bar"><i style="width:' + (clamp(b.value, 0, 1) * 100).toFixed(1) + '%;background:' + rgba(b.col, 1) + '"></i></span>' +
          '<span class="readout__pct">' + esc(b.text) + '</span>' +
          '<span class="readout__tag' + (b.on ? ' is-on' : '') + '">' + esc(b.tag || '') + '</span></li>';
      }).join('');
    }
    if (out.stats) {
      out.stats.innerHTML = r.stats.map(function (st) {
        return '<div' + (st[2] ? ' class="readout__wide"' : '') + '><dt>' + esc(st[0]) + '</dt><dd>' + esc(st[1]) + '</dd></div>';
      }).join('');
    }
    if (out.spark) {
      var d = r.spark.data, lo = r.spark.lo, hi = r.spark.hi;
      if (lo === undefined && d.length) { lo = Math.min.apply(null, d); hi = Math.max.apply(null, d); var pad = (hi - lo) * 0.15 || 0.05; lo -= pad; hi += pad; }
      out.spark.setAttribute('points', d.length > 1 ? d.map(function (v, k) {
        return ((k / (d.length - 1)) * 120).toFixed(1) + ',' + (27 - clamp((v - lo) / (hi - lo), 0, 1) * 26).toFixed(1);
      }).join(' ') : '');
      if (out.sparkLabel) out.sparkLabel.textContent = r.spark.label;
    }
    if (out.event && (sc.event !== lastEvent || force)) {
      lastEvent = sc.event;
      out.event.textContent = sc.event;
      out.event.classList.remove('is-new'); void out.event.offsetWidth; out.event.classList.add('is-new');
    }
  }

  function go(i, byUser) {
    if (i === current && fade >= 1) return;
    if (byUser) pauseUntil = frame + 2700;
    prev = current; current = i; fade = 0; sceneT = 0;
    scenes[current].layout();
    scenes[current].enter();
    tabs.forEach(function (b, k) { b.classList.toggle('is-active', k === i); b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    renderReadout(true);
    if (reduce) { settle(scenes[current]); draw(); }
  }

  function layout() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ambient = W < 1100;
    if (ambient) {
      // small screens: the scene fills the hero faintly behind the text
      box = { x: W * 0.05, y: H * 0.1, w: W * 0.9, h: H * 0.82 };
      BASE = W < 760 ? 0.38 : 0.5;
    } else {
      box = { x: W * 0.53, y: H * 0.5, w: W * 0.44, h: H * 0.45 };
      BASE = 1;
    }
    s = clamp(Math.min(box.w / 634, box.h / 405), 0.55, 1.4);
    scenes.forEach(function (sc) { sc.layout(); });
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (prev > -1 && fade < 1) {
      G = BASE * (1 - ease(fade)); ctx.globalAlpha = G;
      scenes[prev].draw();
    }
    G = BASE * ease(fade); ctx.globalAlpha = G;
    scenes[current].draw();
    if (!ambient) text(scenes[current].hint, box.x + box.w, box.y + box.h + 24, IVORY, 0.5, 'right', 10);
    ctx.globalAlpha = 1;
  }

  function step() {
    frame++;
    scenes[current].step();
    if (prev > -1 && fade < 1) scenes[prev].step();
    if (fade < 1) fade = Math.min(1, fade + 1 / FADE);
    if (!hoverPanel && frame > pauseUntil) sceneT++;
    if (sceneT >= DURATION) go((current + 1) % scenes.length, false);
    if (tabs[current]) tabs[current].querySelector('i').style.width = Math.min(100, sceneT / DURATION * 100) + '%';
    if (frame % 10 === 0) renderReadout(false);
  }

  function settle(sc) {
    for (var k = 0; k < 360; k++) sc.step();
    fade = 1; prev = -1;
    renderReadout(true);
  }

  var running = false, visible = true;
  function loop() {
    if (!running) return;
    step(); draw();
    requestAnimationFrame(loop);
  }
  function start() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(loop); } }
  function stop() { running = false; }

  scenes.forEach(function (sc) { sc.init(); });
  layout();
  window.addEventListener('resize', function () {
    layout();
    if (reduce) draw();
  });
  go(0, false);

  hero.addEventListener('click', function (e) {
    if (e.target.closest('a, button, .readout')) return;
    var r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    if (scenes[current].onClick(x, y)) {
      pauseUntil = frame + 1200;
      renderReadout(false);
      if (reduce) { for (var k = 0; k < 200; k++) scenes[current].step(); draw(); renderReadout(false); }
    }
  });

  if (reduce) {
    // no motion: settle each scene silently and show a still frame; tabs still switch scenes
    settle(scenes[current]);
    draw();
    return;
  }

  hero.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.in = true;
    var over = !e.target.closest('a, button, .readout') && scenes[current].clickable(mouse.x, mouse.y);
    hero.style.cursor = over ? 'pointer' : '';
  });
  hero.addEventListener('pointerleave', function () { mouse.in = false; hero.style.cursor = ''; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  start();
})();
