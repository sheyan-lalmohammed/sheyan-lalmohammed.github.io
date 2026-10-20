/* Hero background: a live market of buyers (circles) and sellers (diamonds).
   Agents drift, link up when close, and trade when a buyer's value exceeds a seller's cost.
   Trades flash, update the readout, and feed a sparkline of recent prices. */
(function () {
  'use strict';

  var canvas = document.querySelector('[data-hero-canvas]');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduce = window.Site && window.Site.reduce;

  var ACC = [224, 90, 112];
  var AMB = [245, 177, 76];
  var LINK = 120;       // px within which agents are linked
  var TRADE = 34;       // px within which a buyer and seller can trade
  var COOLDOWN = 150;   // frames before an agent can trade again

  var W = 0, H = 0, dpr = 1;
  var agents = [];
  var pulses = [];
  var prices = [];
  var trades = 0;
  var priceEMA = null;
  var mouse = { x: -9999, y: -9999, active: false };
  var running = false, visible = true, frame = 0;

  var out = {
    buyers: document.querySelector('[data-readout="buyers"]'),
    sellers: document.querySelector('[data-readout="sellers"]'),
    trades: document.querySelector('[data-readout="trades"]'),
    price: document.querySelector('[data-readout="price"]'),
    spark: document.querySelector('[data-readout="spark"]')
  };

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var target = Math.max(28, Math.min(110, Math.round((W * H) / 15000)));
    while (agents.length < target) agents.push(makeAgent());
    if (agents.length > target) agents.length = target;
    agents.forEach(function (a) {
      if (a.x > W) a.x = Math.random() * W;
      if (a.y > H) a.y = Math.random() * H;
    });
    if (out.buyers) {
      var b = agents.filter(function (a) { return a.buyer; }).length;
      out.buyers.textContent = b;
      out.sellers.textContent = agents.length - b;
    }
  }

  function makeAgent() {
    var buyer = Math.random() < 0.5;
    var speed = 0.15 + Math.random() * 0.35;
    var ang = Math.random() * Math.PI * 2;
    return {
      buyer: buyer,
      x: Math.random() * (W || 1200),
      y: Math.random() * (H || 800),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r: 1.6 + Math.random() * 1.8,
      // buyers carry a reservation value, sellers a cost, both on [0, 1]
      val: buyer ? 0.25 + Math.random() * 0.75 : Math.random() * 0.75,
      cool: Math.floor(Math.random() * COOLDOWN),
      flash: 0
    };
  }

  function step() {
    var i, j, a, b, dx, dy, d2, d;

    for (i = 0; i < agents.length; i++) {
      a = agents[i];
      // gentle random drift
      a.vx += (Math.random() - 0.5) * 0.02;
      a.vy += (Math.random() - 0.5) * 0.02;
      // attraction toward the cursor
      if (mouse.active) {
        dx = mouse.x - a.x; dy = mouse.y - a.y;
        d2 = dx * dx + dy * dy;
        if (d2 < 220 * 220 && d2 > 1) {
          d = Math.sqrt(d2);
          a.vx += (dx / d) * 0.035;
          a.vy += (dy / d) * 0.035;
        }
      }
      var sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      var max = mouse.active ? 1.6 : 0.6;
      if (sp > max) { a.vx *= max / sp; a.vy *= max / sp; }
      a.x += a.vx; a.y += a.vy;
      if (a.x < -10) a.x = W + 10; else if (a.x > W + 10) a.x = -10;
      if (a.y < -10) a.y = H + 10; else if (a.y > H + 10) a.y = -10;
      if (a.cool > 0) a.cool--;
      if (a.flash > 0) a.flash -= 0.03;
    }

    ctx.clearRect(0, 0, W, H);

    // links and trades
    ctx.lineWidth = 1;
    for (i = 0; i < agents.length; i++) {
      a = agents[i];
      for (j = i + 1; j < agents.length; j++) {
        b = agents[j];
        dx = a.x - b.x; dy = a.y - b.y;
        d2 = dx * dx + dy * dy;
        if (d2 > LINK * LINK) continue;
        d = Math.sqrt(d2);
        var cross = a.buyer !== b.buyer;
        var alpha = (1 - d / LINK) * (cross ? 0.32 : 0.12);
        ctx.strokeStyle = cross ? rgba(ACC, alpha) : rgba([176, 158, 163], alpha);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        if (cross && d < TRADE && a.cool === 0 && b.cool === 0) {
          var buyer = a.buyer ? a : b, seller = a.buyer ? b : a;
          if (buyer.val >= seller.val) trade(buyer, seller);
        }
      }
    }

    // trade pulses
    for (i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      p.t += 0.025;
      if (p.t >= 1) { pulses.splice(i, 1); continue; }
      ctx.strokeStyle = rgba(AMB, (1 - p.t) * 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 + p.t * 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    // agents
    for (i = 0; i < agents.length; i++) {
      a = agents[i];
      var col = a.buyer ? ACC : AMB;
      var glow = 0.55 + Math.max(0, a.flash) * 0.45;
      var rr = a.r + Math.max(0, a.flash) * 2.5;
      ctx.fillStyle = rgba(col, 0.12 * glow);
      ctx.beginPath();
      ctx.arc(a.x, a.y, rr * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(col, glow);
      ctx.beginPath();
      if (a.buyer) {
        ctx.arc(a.x, a.y, rr, 0, Math.PI * 2);
      } else {
        ctx.moveTo(a.x, a.y - rr * 1.3);
        ctx.lineTo(a.x + rr * 1.3, a.y);
        ctx.lineTo(a.x, a.y + rr * 1.3);
        ctx.lineTo(a.x - rr * 1.3, a.y);
        ctx.closePath();
      }
      ctx.fill();
    }

    if (++frame % 12 === 0) updateReadout();
  }

  function trade(buyer, seller) {
    var price = (buyer.val + seller.val) / 2;
    trades++;
    priceEMA = priceEMA === null ? price : priceEMA * 0.9 + price * 0.1;
    prices.push(priceEMA);
    if (prices.length > 40) prices.shift();
    pulses.push({ x: (buyer.x + seller.x) / 2, y: (buyer.y + seller.y) / 2, t: 0 });
    buyer.cool = seller.cool = COOLDOWN;
    buyer.flash = seller.flash = 1;
    // draw fresh values so the market keeps clearing at a stable price
    buyer.val = 0.25 + Math.random() * 0.75;
    seller.val = Math.random() * 0.75;
  }

  function updateReadout() {
    if (!out.trades) return;
    out.trades.textContent = trades.toLocaleString();
    if (priceEMA !== null) out.price.textContent = priceEMA.toFixed(3);
    if (out.spark && prices.length > 1) {
      var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
      var span = Math.max(hi - lo, 0.02);
      out.spark.setAttribute('points', prices.map(function (v, k) {
        return ((k / (prices.length - 1)) * 120).toFixed(1) + ',' + (26 - ((v - lo) / span) * 24).toFixed(1);
      }).join(' '));
    }
  }

  function loop() {
    if (!running) return;
    step();
    requestAnimationFrame(loop);
  }
  function start() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(loop); } }
  function stop() { running = false; }

  resize();
  window.addEventListener('resize', resize);

  if (reduce) {
    // one static frame of the market, no motion
    for (var k = 0; k < 3; k++) step();
    return;
  }

  var hero = canvas.parentElement;
  hero.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.active = true;
  });
  hero.addEventListener('pointerleave', function () { mouse.active = false; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });
  start();
})();
