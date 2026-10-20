/* Archive page: filter by format and topic, free-text search, "/" to focus search. */
(function () {
  'use strict';

  var items = Array.prototype.slice.call(document.querySelectorAll('[data-pub]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-year-group]'));
  var search = document.querySelector('[data-search]');
  var shown = document.querySelector('[data-count-shown]');
  var empty = document.querySelector('[data-empty]');
  var state = { type: '*', tag: '*', q: '' };

  function apply() {
    var n = 0;
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    items.forEach(function (it) {
      var tags = (it.getAttribute('data-tags') || '').split('|');
      var hay = it.getAttribute('data-text') || '';
      var ok = (state.type === '*' || it.getAttribute('data-type') === state.type) &&
        (state.tag === '*' || tags.indexOf(state.tag) > -1) &&
        terms.every(function (t) { return hay.indexOf(t) > -1; });
      it.hidden = !ok;
      if (ok) n++;
    });
    groups.forEach(function (g) {
      g.hidden = !g.querySelector('[data-pub]:not([hidden])');
    });
    if (shown) shown.textContent = n;
    if (empty) empty.hidden = n > 0;
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  function setChip(group, value) {
    var wrap = document.querySelector('[data-filter-group="' + group + '"]');
    if (!wrap) return;
    wrap.querySelectorAll('[data-filter]').forEach(function (c) {
      var on = c.getAttribute('data-filter') === value;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    state[group] = value;
  }

  document.querySelectorAll('[data-filter-group]').forEach(function (wrap) {
    var group = wrap.getAttribute('data-filter-group');
    wrap.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-filter]');
      if (!chip) return;
      var v = chip.getAttribute('data-filter');
      setChip(group, state[group] === v && v !== '*' ? '*' : v);
      apply();
    });
  });

  if (search) {
    search.addEventListener('input', function () { state.q = search.value; apply(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== search && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault();
        search.focus();
      }
      if (e.key === 'Escape' && document.activeElement === search) { search.value = ''; state.q = ''; apply(); search.blur(); }
    });
  }

  var reset = document.querySelector('[data-reset]');
  if (reset) reset.addEventListener('click', function () {
    setChip('type', '*'); setChip('tag', '*');
    if (search) search.value = '';
    state.q = '';
    apply();
  });

  // ?tag=Industrial%20Organization deep links
  var params = new URLSearchParams(window.location.search);
  if (params.get('tag')) setChip('tag', params.get('tag'));
  if (params.get('type')) setChip('type', params.get('type'));
  if (params.get('tag') || params.get('type')) apply();

  // #paper-id deep links: open that abstract and make sure it is visible
  function openHash() {
    var id = decodeURIComponent(window.location.hash.slice(1));
    var target = id && document.getElementById(id);
    if (!target || !target.matches('[data-pub]')) return;
    target.style.opacity = 1;
    target.style.transform = 'none';
    var d = target.querySelector('details');
    if (d) d.open = true;
  }
  openHash();
  window.addEventListener('hashchange', openHash);
})();
