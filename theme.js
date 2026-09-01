/**
 * Pennio theme toggle.
 *
 * Shared by every page. Pages opt in by giving any control a
 * `data-theme-toggle` attribute; no per-page wiring is needed.
 *
 * Dark is the default because it is the brand's own presentation - a visitor
 * who never touches the control sees exactly what they saw before. The stored
 * choice is what wins on later visits, not the operating system setting.
 *
 * The paint-blocking half of this lives inline in each page's <head>, since a
 * deferred file cannot run early enough to stop a flash of the wrong theme.
 */
(function () {
  'use strict';

  var KEY = 'pennio-theme';
  var root = document.documentElement;

  function current() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function syncControls(theme) {
    var light = theme === 'light';
    var controls = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < controls.length; i++) {
      controls[i].setAttribute('aria-pressed', String(light));
      controls[i].setAttribute(
        'aria-label',
        light ? 'Switch to dark theme' : 'Switch to light theme'
      );
    }
  }

  function apply(theme, persist) {
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');

    if (persist) {
      try {
        localStorage.setItem(KEY, theme);
      } catch (e) {
        /* private browsing or blocked storage: the toggle still works for this page view */
      }
    }
    syncControls(theme);
  }

  function init() {
    syncControls(current());
    var controls = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < controls.length; i++) {
      controls[i].addEventListener('click', function () {
        apply(current() === 'light' ? 'dark' : 'light', true);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Keep other open tabs on the same theme.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && e.newValue) apply(e.newValue, false);
  });
})();
