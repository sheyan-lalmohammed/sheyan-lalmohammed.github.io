/* Site-wide behaviour: nav, reveals, split text, counters, rotator, pointer effects.
   Page-specific scripts (hero.js, story.js, archive.js) build on window.Site. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  window.Site = { reduce: reduce, hasGsap: hasGsap, finePointer: finePointer };

  if (!hasGsap || reduce) {
    root.classList.add('no-anim');
  } else {
    gsap.registerPlugin(ScrollTrigger);
  }
  window.__siteReady = true;

  /* ---------- nav: solid after scrolling, hides on scroll down ---------- */
  var nav = document.querySelector('[data-nav]');
  var lastY = window.scrollY;
  function onScroll() {
    var y = window.scrollY;
    if (nav) {
      nav.classList.toggle('is-scrolled', y > 20);
      nav.classList.toggle('is-hidden', y > 480 && y > lastY + 4);
      if (y < lastY - 4) nav.classList.remove('is-hidden');
    }
    lastY = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- copy-to-clipboard buttons ---------- */
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var label = btn.querySelector('span');
      var original = label ? label.textContent : '';
      var done = function () {
        if (!label) return;
        label.textContent = 'Copied!';
        setTimeout(function () { label.textContent = original; }, 1600);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(done, function () {});
      }
    });
  });

  /* ---------- typing rotator for the hero research focus ---------- */
  var rot = document.querySelector('[data-rotator]');
  if (rot && !reduce) {
    var words = [];
    try { words = JSON.parse(rot.getAttribute('data-words')) || []; } catch (e) {}
    if (words.length > 1) {
      var wi = 0;
      var typeWord = function (word, i) {
        rot.textContent = word.slice(0, i);
        if (i < word.length) setTimeout(function () { typeWord(word, i + 1); }, 45 + Math.random() * 40);
        else setTimeout(eraseWord, 2400);
      };
      var eraseWord = function () {
        var t = rot.textContent;
        if (t.length) {
          rot.textContent = t.slice(0, -1);
          setTimeout(eraseWord, 22);
        } else {
          wi = (wi + 1) % words.length;
          typeWord(words[wi], 1);
        }
      };
      setTimeout(eraseWord, 3200);
    }
  }

  /* ---------- pointer effects: cursor glow + card spotlight + tilt ---------- */
  if (finePointer && !reduce) {
    root.classList.add('has-pointer');
    var glow = document.querySelector('.cursor-glow');
    var gx = 0, gy = 0, tx = 0, ty = 0, glowRunning = false;
    var moveGlow = function () {
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      glow.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0)';
      if (Math.abs(tx - gx) > 0.5 || Math.abs(ty - gy) > 0.5) requestAnimationFrame(moveGlow);
      else glowRunning = false;
    };
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (glow && !glowRunning) { glowRunning = true; requestAnimationFrame(moveGlow); }
    }, { passive: true });

    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });

    if (hasGsap) {
      document.querySelectorAll('[data-tilt]').forEach(function (card) {
        card.addEventListener('pointermove', function (e) {
          var r = card.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          gsap.to(card, { rotateY: px * 6, rotateX: -py * 6, transformPerspective: 900, duration: 0.5, ease: 'power2.out' });
        });
        card.addEventListener('pointerleave', function () {
          gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.7, ease: 'power3.out' });
        });
      });
    }
  }

  if (!hasGsap || reduce) return;

  /* ---------- split text helpers ---------- */
  function splitChars(el) {
    var text = el.textContent;
    el.textContent = '';
    el.setAttribute('aria-label', text.trim());
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement('span');
      s.className = 'split-char';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = text[i] === ' ' ? ' ' : text[i];
      el.appendChild(s);
    }
    return el.querySelectorAll('.split-char');
  }

  function splitWords(el) {
    var words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', words.join(' '));
    el.textContent = '';
    var inner = [];
    words.forEach(function (w, i) {
      var mask = document.createElement('span');
      mask.className = 'split-wmask';
      mask.setAttribute('aria-hidden', 'true');
      var s = document.createElement('span');
      s.className = 'split-word';
      s.textContent = w;
      mask.appendChild(s);
      el.appendChild(mask);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      inner.push(s);
    });
    return inner;
  }

  /* ---------- hero intro ---------- */
  var heroTitle = document.querySelector('.hero [data-split]');
  var intro = gsap.timeline({ defaults: { ease: 'power4.out' } });
  if (heroTitle) {
    var lines = heroTitle.querySelectorAll('.line');
    lines.forEach(function (line) { line.classList.add('split-line'); });
    var first = lines.length ? splitChars(lines[0]) : [];
    gsap.set(heroTitle, { visibility: 'visible' });
    intro
      .from(first, { yPercent: 115, duration: 1.1, stagger: 0.035 }, 0.15)
      .from(heroTitle.querySelectorAll('.grad-text'), { yPercent: 115, duration: 1.2 }, 0.4)
      .to('.hero .reveal', { opacity: 1, y: 0, duration: 1, stagger: 0.09, ease: 'power3.out' }, 0.7);
  }

  /* ---------- section titles: word reveal on scroll ---------- */
  document.querySelectorAll('[data-split-words]').forEach(function (el) {
    var words = splitWords(el);
    gsap.set(el, { visibility: 'visible' });
    gsap.from(words, {
      yPercent: 110, duration: 1, stagger: 0.06, ease: 'power4.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true }
    });
  });

  /* ---------- generic reveals ---------- */
  var reveals = gsap.utils.toArray('.reveal').filter(function (el) { return !el.closest('.hero'); });
  ScrollTrigger.batch(reveals, {
    start: 'top 90%',
    once: true,
    onEnter: function (batch) {
      gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out', overwrite: true });
    }
  });

  /* ---------- count-up stats ---------- */
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var obj = { v: 0 };
    el.textContent = '0' + suffix;
    gsap.to(obj, {
      v: target, duration: 1.6, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      onUpdate: function () { el.textContent = Math.round(obj.v) + suffix; }
    });
  });

  /* ---------- hero parallax on scroll ---------- */
  if (document.querySelector('.hero__inner')) {
    gsap.to('.hero__inner', {
      yPercent: -18, opacity: 0.2, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
