/* Physics Visual Experience — small shared helpers */
(function () {
  'use strict';

  // Smooth-scroll for in-page anchors
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Simple toast
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  window.showToast = function (msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  };

  // ---- tabbed workbench (used by the Boolean lab) ----
  var tabsBar = document.getElementById('tabs');
  var workbench = document.getElementById('workbench');
  if (tabsBar && workbench) {
    var buttons = Array.prototype.slice.call(tabsBar.querySelectorAll('[data-tab]'));
    var panels = Array.prototype.slice.call(workbench.querySelectorAll('[data-panel]'));
    var busPanel = document.getElementById('busPanel');
    function selectTab(name) {
      buttons.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === name); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
      // the switch bus only drives the gate bench and the expression lab
      if (busPanel) busPanel.hidden = (name !== 'gates' && name !== 'expr');
      // let canvases that were hidden re-measure themselves
      window.dispatchEvent(new Event('resize'));
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { selectTab(b.getAttribute('data-tab')); });
    });
    selectTab('gates');
  }
})();
