/* Story section: a sticky SVG figure that redraws itself for each chapter.
   Scenes are keyed by the `scene` field in _data/story.yml:
   line | network | dag | market | fit */
(function () {
  'use strict';

  var svg = document.querySelector('[data-scene]');
  var chapters = Array.prototype.slice.call(document.querySelectorAll('[data-chapter]'));
  if (!svg || !chapters.length) return;

  var NS = 'http://www.w3.org/2000/svg';
  var animate = window.Site && window.Site.hasGsap && !window.Site.reduce;
  var figNum = document.querySelector('[data-fig-num]');
  var figYear = document.querySelector('[data-fig-year]');
  var figCaption = document.querySelector('[data-fig-caption]');
  var rail = Array.prototype.slice.call(document.querySelectorAll('[data-rail]'));

  // plot area inside the 400 x 300 viewBox
  var X0 = 48, X1 = 372, Y0 = 34, Y1 = 252;

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(n);
    return n;
  }
  function text(str, attrs, parent) { var t = el('text', attrs, parent); t.textContent = str; return t; }

  // deterministic pseudo-random numbers so figures look the same on every visit
  function rng(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function pathFrom(points) {
    return points.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  }

  function axes(g, xl, yl) {
    for (var i = 1; i <= 3; i++) {
      var y = Y1 - ((Y1 - Y0) * i) / 4;
      el('line', { x1: X0, y1: y, x2: X1, y2: y, class: 'gridline' }, g);
    }
    var ax = el('path', { d: 'M' + X0 + ' ' + Y0 + ' L' + X0 + ' ' + Y1 + ' L' + X1 + ' ' + Y1, class: 'axis', fill: 'none' }, g);
    text(xl, { x: X1, y: Y1 + 18, 'text-anchor': 'end', class: 'lbl' }, g);
    text(yl, { x: X0 - 8, y: Y0 - 12, class: 'lbl' }, g);
    return ax;
  }

  // stroke-draw helper: returns a tween that draws `node` from nothing
  function draw(tl, node, opts, at) {
    var len = node.getTotalLength();
    node.style.strokeDasharray = len + ' ' + len;
    node.style.strokeDashoffset = len;
    tl.to(node, Object.assign({ strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, opts || {}), at);
  }

  /* ---------------- scenes ---------------- */
  // Each builder fills a <g> and returns { enter: timeline, loop: timeline|null }.

  var scenes = {

    // 2022: two monetary paths diverge after a new instrument is introduced
    line: function (g) {
      var R = rng(7);
      var ax = axes(g, 'time →', 'adoption');
      var split = 0.42, base = [], branch = [];
      for (var i = 0; i <= 60; i++) {
        var t = i / 60;
        var x = X0 + t * (X1 - X0);
        var y = Y1 - 30 - t * 70 - Math.sin(t * 9) * 6 - R() * 5;
        base.push([x, y]);
        if (t >= split) {
          var u = (t - split) / (1 - split);
          branch.push([x, y - u * u * 110 - R() * 3]);
        }
      }
      var xs = X0 + split * (X1 - X0);
      var marker = el('line', { x1: xs, y1: Y1, x2: xs, y2: Y0 + 6, class: 's-dim', 'stroke-dasharray': '3 4' }, g);
      var mLbl = text('new instrument', { x: xs + 6, y: Y0 + 14, class: 'lbl' }, g);
      var p1 = el('path', { d: pathFrom(base), class: 's-acc' }, g);
      var p2 = el('path', { d: pathFrom(branch), class: 's-amb' }, g);
      var l1 = text('cash & deposits', { x: X0 + 8, y: base[0][1] + 20, class: 'lbl lbl--acc' }, g);
      var l2 = text('CBDC', { x: X1 - 4, y: branch[branch.length - 1][1] - 8, 'text-anchor': 'end', class: 'lbl lbl--amb' }, g);
      var dot = el('circle', { r: 4, class: 'f-amb', cx: xs, cy: branch[0][1] }, g);

      if (!animate) return {};
      var tl = gsap.timeline({ paused: true });
      draw(tl, ax, { duration: 0.8 }, 0);
      draw(tl, p1, { duration: 1.4 }, 0.2);
      tl.from(marker, { attr: { y2: Y1 }, duration: 0.6, ease: 'power3.out' }, 0.7)
        .from(mLbl, { opacity: 0, duration: 0.4 }, 0.9);
      draw(tl, p2, { duration: 1.1 }, 1.0);
      tl.from([l1, l2], { opacity: 0, y: 6, duration: 0.5, stagger: 0.15 }, 1.6)
        .from(dot, { opacity: 0, duration: 0.3 }, 1.8);

      var len = p2.getTotalLength(), s = { v: 0 };
      var loop = gsap.timeline({ paused: true, repeat: -1 })
        .to(s, {
          v: 1, duration: 3.2, ease: 'sine.inOut',
          onUpdate: function () {
            var pt = p2.getPointAtLength(s.v * len);
            dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
          }
        });
      return { enter: tl, loop: loop };
    },

    // 2024: human and AI agents in a network of interactions
    network: function (g) {
      var nodes = [
        [92, 88, 'H'], [160, 58, 'AI'], [232, 92, 'H'], [312, 66, 'H'], [118, 168, 'AI'],
        [200, 150, 'H'], [282, 160, 'AI'], [346, 136, 'H'], [78, 238, 'H'], [168, 236, 'H'],
        [250, 228, 'AI'], [330, 228, 'H']
      ];
      var links = [[0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 5], [2, 6], [3, 7], [6, 7], [4, 5],
        [5, 6], [4, 8], [4, 9], [5, 9], [5, 10], [6, 10], [6, 11], [7, 11], [9, 10], [10, 11], [1, 4], [3, 6]];

      text('● human', { x: 20, y: 22, class: 'lbl lbl--acc' }, g);
      text('● AI agent', { x: 78, y: 22, class: 'lbl', fill: '#8f86ff', style: 'fill:#8f86ff' }, g);

      var edgeG = el('g', {}, g), nodeG = el('g', {}, g), pulseG = el('g', {}, g);
      var edges = links.map(function (l) {
        var a = nodes[l[0]], b = nodes[l[1]];
        return el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'edge' }, edgeG);
      });
      var circles = nodes.map(function (n) {
        var ai = n[2] === 'AI';
        var c = el('g', { transform: 'translate(' + n[0] + ' ' + n[1] + ')' }, nodeG);
        el('circle', { r: ai ? 15 : 12, class: 'node ' + (ai ? 'node--vio' : 'node--acc') }, c);
        text(n[2], { class: 'node-lbl' }, c);
        return c;
      });

      if (!animate) return {};
      var tl = gsap.timeline({ paused: true });
      tl.from(circles.map(function (c) { return c.firstChild; }), { attr: { r: 0 }, duration: 0.6, stagger: 0.05, ease: 'back.out(2)' }, 0)
        .from(circles.map(function (c) { return c.lastChild; }), { opacity: 0, duration: 0.4, stagger: 0.05 }, 0.2);
      edges.forEach(function (e, i) { draw(tl, e, { duration: 0.5 }, 0.4 + i * 0.03); });

      // messages travelling along random edges
      var loop = gsap.timeline({ paused: true, repeat: -1 });
      var R = rng(11);
      for (var k = 0; k < 10; k++) {
        var l = links[Math.floor(R() * links.length)];
        var a = nodes[l[0]], b = nodes[l[1]];
        var p = el('circle', { r: 2.6, cx: a[0], cy: a[1], class: 'f-acc', opacity: 0 }, pulseG);
        loop.fromTo(p, { attr: { cx: a[0], cy: a[1] }, opacity: 1 },
          { attr: { cx: b[0], cy: b[1] }, opacity: 0.2, duration: 1.1, ease: 'power1.inOut' }, k * 0.35)
          .to(edges[links.indexOf(l)], { stroke: '#e05a70', duration: 0.25, yoyo: true, repeat: 1 }, k * 0.35);
      }
      return { enter: tl, loop: loop };
    },

    // 2025: a dynamic Bayesian network over two time slices
    dag: function (g) {
      var N = {
        inc: [70, 92, 'income'], cs: [70, 200, 'credit'],
        u0: [190, 92, 'usage_t'], m0: [190, 200, 'missed_t'],
        u1: [310, 92, 'usage_t+1'], m1: [310, 200, 'missed_t+1'],
        d: [310, 262, 'default']
      };
      var E = [['inc', 'u0'], ['inc', 'm0'], ['cs', 'm0'], ['u0', 'm0'], ['u0', 'u1'], ['m0', 'm1'], ['u1', 'm1'], ['m0', 'u1'], ['m1', 'd'], ['cs', 'd']];
      var W2 = 34, H2 = 13;

      text('slice t', { x: 190, y: 40, 'text-anchor': 'middle', class: 'lbl' }, g);
      text('slice t+1', { x: 310, y: 40, 'text-anchor': 'middle', class: 'lbl' }, g);
      el('rect', { x: 140, y: 52, width: 100, height: 176, rx: 10, class: 's-dim', 'stroke-dasharray': '3 4' }, g);
      el('rect', { x: 260, y: 52, width: 100, height: 176, rx: 10, class: 's-dim', 'stroke-dasharray': '3 4' }, g);

      var edgeG = el('g', {}, g), nodeG = el('g', {}, g);
      var edges = E.map(function (e) {
        var a = N[e[0]], b = N[e[1]];
        var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
        var ux = dx / len, uy = dy / len;
        // trim the segment to the node boxes
        var ta = Math.min(Math.abs(W2 / (ux || 1e-6)), Math.abs(H2 / (uy || 1e-6))) + 3;
        var tb = Math.min(Math.abs(W2 / (ux || 1e-6)), Math.abs(H2 / (uy || 1e-6))) + 5;
        var x1 = a[0] + ux * ta, y1 = a[1] + uy * ta, x2 = b[0] - ux * tb, y2 = b[1] - uy * tb;
        var line = el('path', { d: 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2, class: 'edge' }, edgeG);
        var hx = x2 - ux * 7, hy = y2 - uy * 7;
        var head = el('polygon', {
          points: x2 + ',' + y2 + ' ' + (hx - uy * 3.5) + ',' + (hy + ux * 3.5) + ' ' + (hx + uy * 3.5) + ',' + (hy - ux * 3.5),
          fill: 'rgba(176,158,163,0.5)'
        }, edgeG);
        return { line: line, head: head, from: e[0], to: e[1] };
      });
      var boxes = {};
      Object.keys(N).forEach(function (k) {
        var n = N[k];
        var c = el('g', { transform: 'translate(' + n[0] + ' ' + n[1] + ')' }, nodeG);
        var r = el('rect', { x: -W2, y: -H2, width: W2 * 2, height: H2 * 2, rx: 7, class: 'node ' + (k === 'd' ? 'node--amb' : 'node--acc') }, c);
        text(n[2], { class: 'node-lbl' }, c);
        boxes[k] = { g: c, rect: r };
      });

      if (!animate) return {};
      var order = [['inc', 'cs'], ['u0', 'm0'], ['u1', 'm1'], ['d']];
      var tl = gsap.timeline({ paused: true });
      order.forEach(function (layer, i) {
        tl.from(layer.map(function (k) { return boxes[k].g; }), { opacity: 0, scale: 0.6, transformOrigin: '50% 50%', duration: 0.5, stagger: 0.1, ease: 'back.out(2)' }, i * 0.45);
      });
      edges.forEach(function (e, i) {
        draw(tl, e.line, { duration: 0.45 }, 0.5 + i * 0.12);
        tl.from(e.head, { opacity: 0, duration: 0.2 }, 0.9 + i * 0.12);
      });

      // evidence propagating from income to default
      var path = ['inc', 'u0', 'm0', 'm1', 'd'];
      var loop = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.6 });
      path.forEach(function (k, i) {
        loop.to(boxes[k].rect, { fill: k === 'd' ? 'rgba(245,177,76,0.28)' : 'rgba(224,90,112,0.24)', duration: 0.3 }, i * 0.45)
          .to(boxes[k].rect, { fill: '#161012', duration: 0.6 }, i * 0.45 + 0.9);
        if (i) {
          var e = edges.filter(function (x) { return x.from === path[i - 1] && x.to === k; })[0];
          if (e) loop.to(e.line, { stroke: '#e05a70', duration: 0.25 }, i * 0.45 - 0.15).to(e.line, { stroke: 'rgba(176,158,163,0.26)', duration: 0.6 }, i * 0.45 + 0.6);
        }
      });
      return { enter: tl, loop: loop };
    },

    // 2026: supply shifts, equilibrium moves, platform shares follow
    market: function (g) {
      var ax = axes(g, 'quantity →', 'price');
      function px(q) { return X0 + q * 28; }
      function py(p) { return Y1 - p * 21; }
      function demand(q) { return 9 - 0.8 * q; }
      function supply(q, s) { return 1 + 0.7 * (q - 2 * s); }
      function curve(f) { var pts = []; for (var q = 0.3; q <= 7.3; q += 0.25) pts.push([px(q), py(f(q))]); return pathFrom(pts); }

      var dPath = el('path', { d: curve(demand), class: 's-acc' }, g);
      var sGhost = el('path', { d: curve(function (q) { return supply(q, 0); }), class: 's-dim', 'stroke-dasharray': '3 4', opacity: 0 }, g);
      var sPath = el('path', { d: curve(function (q) { return supply(q, 0); }), class: 's-amb' }, g);
      var dl = text('D', { x: px(7.3) + 5, y: py(demand(7.3)) + 3, class: 'lbl lbl--acc' }, g);
      var sl = text('S', { x: px(7.3) + 5, y: py(supply(7.3, 0)) + 3, class: 'lbl lbl--amb' }, g);
      var hx = el('line', { class: 's-dim', 'stroke-dasharray': '2 3' }, g);
      var vx = el('line', { class: 's-dim', 'stroke-dasharray': '2 3' }, g);
      var eq = el('circle', { r: 5, fill: '#fff' }, g);

      // panel: equilibrium readout and market shares of a mandatory- vs optional-royalty platform
      var inset = el('g', { transform: 'translate(282 52)' }, g);
      el('rect', { x: 0, y: 0, width: 96, height: 150, rx: 8, fill: 'rgba(10,7,8,0.85)', stroke: 'rgba(176,158,163,0.26)' }, inset);
      text('equilibrium', { x: 10, y: 18, class: 'lbl' }, inset);
      var pLbl = text('', { x: 10, y: 36, class: 'lbl', style: 'fill:#f1eaec' }, inset);
      var qLbl = text('', { x: 10, y: 52, class: 'lbl', style: 'fill:#f1eaec' }, inset);
      text('market share', { x: 10, y: 80, class: 'lbl' }, inset);
      el('rect', { x: 10, y: 88, width: 76, height: 8, rx: 3, fill: 'rgba(176,158,163,0.12)' }, inset);
      el('rect', { x: 10, y: 118, width: 76, height: 8, rx: 3, fill: 'rgba(176,158,163,0.12)' }, inset);
      var barA = el('rect', { x: 10, y: 88, height: 8, rx: 3, class: 'f-acc' }, inset);
      var barB = el('rect', { x: 10, y: 118, height: 8, rx: 3, class: 'f-amb' }, inset);
      text('mandatory', { x: 10, y: 108, class: 'lbl', style: 'font-size:7.5px' }, inset);
      text('optional', { x: 10, y: 138, class: 'lbl', style: 'font-size:7.5px' }, inset);
      var eqLbl = text('E', { class: 'lbl', style: 'fill:#f1eaec' }, g);

      function setShift(s) {
        sPath.setAttribute('d', curve(function (q) { return supply(q, s); }));
        sl.setAttribute('y', py(supply(7.3, s)) + 3);
        var q = (8 + 1.4 * s) / 1.5, p = demand(q);
        var x = px(q), y = py(p);
        eq.setAttribute('cx', x); eq.setAttribute('cy', y);
        hx.setAttribute('x1', X0); hx.setAttribute('x2', x); hx.setAttribute('y1', y); hx.setAttribute('y2', y);
        vx.setAttribute('x1', x); vx.setAttribute('x2', x); vx.setAttribute('y1', y); vx.setAttribute('y2', Y1);
        eqLbl.setAttribute('x', x - 4); eqLbl.setAttribute('y', y - 10);
        pLbl.textContent = 'p* = ' + p.toFixed(2);
        qLbl.textContent = 'q* = ' + q.toFixed(2);
        var share = 0.62 - 0.3 * s;
        barA.setAttribute('width', 76 * share);
        barB.setAttribute('width', 76 * (1 - share));
      }
      setShift(0);

      if (!animate) return {};
      var tl = gsap.timeline({ paused: true });
      draw(tl, ax, { duration: 0.7 }, 0);
      draw(tl, dPath, { duration: 1 }, 0.2);
      draw(tl, sPath, { duration: 1 }, 0.4);
      tl.from([dl, sl], { opacity: 0, duration: 0.4 }, 1.2)
        .from([hx, vx], { opacity: 0, duration: 0.4 }, 1.3)
        .from(eq, { attr: { r: 0 }, duration: 0.5, ease: 'back.out(3)' }, 1.3)
        .from([eqLbl, inset], { opacity: 0, duration: 0.5 }, 1.5)
        .set(sGhost, { opacity: 1 }, 1.6);

      var st = { s: 0 };
      var loop = gsap.timeline({ paused: true, repeat: -1, yoyo: true, repeatDelay: 0.8 })
        .to(st, { s: 1, duration: 2.4, ease: 'power2.inOut', onUpdate: function () { setShift(st.s); } });
      return { enter: tl, loop: loop };
    },

    // Now: observations, a fitted curve, and its confidence band
    fit: function (g) {
      var R = rng(23);
      var ax = axes(g, 'x →', 'y');
      function f(t) { return 0.15 + 0.55 * Math.log(1 + 6 * t) / Math.log(7); }
      function toX(t) { return X0 + 10 + t * (X1 - X0 - 20); }
      function toY(v) { return Y1 - v * (Y1 - Y0); }
      var upper = [], lower = [], mid = [];
      for (var i = 0; i <= 50; i++) {
        var t = i / 50, w = 0.05 + 0.06 * Math.abs(t - 0.5);
        mid.push([toX(t), toY(f(t))]);
        upper.push([toX(t), toY(f(t) + w)]);
        lower.unshift([toX(t), toY(f(t) - w)]);
      }
      var band = el('path', { d: pathFrom(upper.concat(lower)) + ' Z', class: 'f-band' }, g);
      var dots = [];
      for (var k = 0; k < 46; k++) {
        var tt = R();
        var v = f(tt) + (R() - 0.5) * 0.22;
        dots.push(el('circle', { cx: toX(tt), cy: toY(v), r: 2.4, fill: 'rgba(232,236,244,0.7)' }, g));
      }
      var fitLine = el('path', { d: pathFrom(mid), class: 's-acc' }, g);
      var scan = el('line', { y1: Y0, y2: Y1, class: 's-dim' }, g);
      var probe = el('circle', { r: 4.5, class: 'f-amb' }, g);
      var probeLbl = text('', { class: 'lbl lbl--amb' }, g);
      text('θ̂ = argmin Σ (yᵢ − m(xᵢ; θ))²', { x: X0 + 10, y: Y0 + 8, class: 'lbl' }, g);

      function setProbe(t) {
        var x = toX(t), y = toY(f(t));
        scan.setAttribute('x1', x); scan.setAttribute('x2', x);
        probe.setAttribute('cx', x); probe.setAttribute('cy', y);
        probeLbl.setAttribute('x', Math.min(x + 8, X1 - 54)); probeLbl.setAttribute('y', y + 18);
        probeLbl.textContent = 'ŷ = ' + (f(t) * 10).toFixed(2);
      }
      setProbe(0.62);

      if (!animate) return {};
      var tl = gsap.timeline({ paused: true });
      draw(tl, ax, { duration: 0.7 }, 0);
      tl.from(dots, { attr: { r: 0 }, duration: 0.4, stagger: { each: 0.018, from: 'random' }, ease: 'back.out(3)' }, 0.2);
      draw(tl, fitLine, { duration: 1.2 }, 0.9);
      tl.from(band, { opacity: 0, duration: 0.8 }, 1.5)
        .from([scan, probe, probeLbl], { opacity: 0, duration: 0.4 }, 1.9);

      var st = { t: 0.62 };
      var loop = gsap.timeline({ paused: true, repeat: -1, yoyo: true })
        .to(st, { t: 0.95, duration: 2.2, ease: 'sine.inOut', onUpdate: function () { setProbe(st.t); } })
        .to(st, { t: 0.08, duration: 3.6, ease: 'sine.inOut', onUpdate: function () { setProbe(st.t); } });
      return { enter: tl, loop: loop };
    }
  };

  /* ---------------- build one group per chapter ---------------- */

  var built = chapters.map(function (ch) {
    var key = ch.getAttribute('data-scene-key');
    var g = el('g', { opacity: 0, 'data-scene-group': key });
    var api = (scenes[key] || scenes.fit)(g);
    return { g: g, enter: api.enter, loop: api.loop };
  });

  var current = -1;
  function activate(i) {
    if (i === current) return;
    var prev = built[current];
    current = i;
    var next = built[i];

    chapters.forEach(function (c, k) { c.classList.toggle('is-active', k === i); });
    rail.forEach(function (r, k) {
      r.classList.toggle('is-active', k === i);
      r.classList.toggle('is-past', k < i);
    });
    if (figNum) figNum.textContent = i + 1;
    if (figYear) figYear.textContent = chapters[i].getAttribute('data-year');
    var cap = chapters[i].getAttribute('data-caption');

    if (!animate) {
      built.forEach(function (b, k) { b.g.setAttribute('opacity', k === i ? 1 : 0); });
      if (figCaption) figCaption.textContent = cap;
      return;
    }

    if (prev) {
      if (prev.loop) prev.loop.pause();
      gsap.to(prev.g, { opacity: 0, duration: 0.35, ease: 'power2.out' });
    }
    gsap.to(next.g, { opacity: 1, duration: 0.35, delay: prev ? 0.2 : 0 });
    if (next.enter) {
      next.enter.eventCallback('onComplete', function () { if (next.loop && current === i) next.loop.restart(); });
      next.enter.delay(prev ? 0.25 : 0).restart(true);
    }
    if (figCaption) {
      gsap.to(figCaption, {
        opacity: 0, duration: 0.2, onComplete: function () {
          figCaption.textContent = cap;
          gsap.to(figCaption, { opacity: 1, duration: 0.3 });
        }
      });
    }
  }

  if (animate) {
    chapters.forEach(function (ch, i) {
      ScrollTrigger.create({
        trigger: ch,
        start: 'top 60%',
        end: 'bottom 60%',
        onToggle: function (self) { if (self.isActive) activate(i); }
      });
    });
    // start on the first figure once the story scrolls into view
    ScrollTrigger.create({ trigger: '#story', start: 'top 80%', once: true, onEnter: function () { if (current < 0) activate(0); } });
  } else {
    activate(0);
    // without GSAP, still switch figures as chapters scroll past
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) activate(chapters.indexOf(e.target)); });
      }, { rootMargin: '-45% 0px -45% 0px' });
      chapters.forEach(function (c) { io.observe(c); });
    }
  }
})();
