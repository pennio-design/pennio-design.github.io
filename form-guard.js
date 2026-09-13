/**
 * Pennio form guard.
 *
 * Shared by every page that carries a FormSubmit form, including forms that
 * are injected after load. Two measures, chosen so
 * that neither can cost a real enquiry:
 *
 *  1. A trap field, injected at runtime rather than shipped in the HTML, and
 *     parked off-screen. A person filling the visible form can never populate
 *     it, so a filled trap is a safe silent drop. It is injected because the
 *     existing `_honey` field is a published FormSubmit convention that scrapers
 *     already know to skip; a field that only exists after scripts run is not in
 *     the page source they read.
 *
 *  2. An elapsed-time field, which is recorded and submitted rather than
 *     enforced. A form completed in under a second was not typed by a human, but
 *     blocking on that guess would eventually reject a real person using
 *     autofill. Sending the number instead puts the signal in the notification
 *     email, where it can be judged alongside the rest of the submission.
 *
 * Neither measure binds a caller who posts straight to the FormSubmit endpoint,
 * whose id is public in the page source. They reduce automated noise; they are
 * not an access control. See README notes before treating them as one.
 */
(function () {
  'use strict';

  var TRAP_NAME = 'website_confirm';

  function hiddenInput(name) {
    var el = document.createElement('input');
    el.type = 'text';
    el.name = name;
    el.tabIndex = -1;
    el.autocomplete = 'off';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
    return el;
  }

  var GUARD_FLAG = '__pennioGuarded';

  function guard(form) {
    if (form[GUARD_FLAG]) return;
    form[GUARD_FLAG] = true;

    // Timed from when the form appeared, which for an injected form is when it
    // was opened rather than when the page loaded.
    var startedAt = Date.now();

    var trap = hiddenInput(TRAP_NAME);
    form.appendChild(trap);

    var elapsed = document.createElement('input');
    elapsed.type = 'hidden';
    elapsed.name = 'fill_seconds';
    form.appendChild(elapsed);

    // Capture phase, so this settles before the page's own submit handler
    // builds its FormData.
    form.addEventListener(
      'submit',
      function (e) {
        elapsed.value = ((Date.now() - startedAt) / 1000).toFixed(1);
        if (trap.value !== '') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true
    );
  }

  function scan(root) {
    if (root.tagName === 'FORM') guard(root);
    var forms = root.querySelectorAll ? root.querySelectorAll('form') : [];
    for (var i = 0; i < forms.length; i++) guard(forms[i]);
  }

  function init() {
    scan(document);

    // Not every form is in the served HTML. The Let's Create partner sheet is
    // built from a template string when its modal opens, so a one-off pass at
    // load would leave it unguarded.
    if (typeof MutationObserver !== 'function') return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) scan(added[j]);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
