/**
 * Pennio typography pass, shared by every page.
 *
 * Stops a paragraph, list item or heading ending on a single word by joining
 * its last two words with a no-break space. CSS `text-wrap: pretty` does the
 * same in browsers that support it; this covers the ones that do not.
 */
(function () {
  'use strict';

  var style = document.createElement('style');
  style.textContent = 'p,li,figcaption,summary,dd{text-wrap:pretty}h1,h2,h3,h4{text-wrap:balance}';
  document.head.appendChild(style);

  var SKIP = /^(SCRIPT|STYLE|CODE|PRE|TEXTAREA|OPTION|BUTTON|LABEL|INPUT|SELECT)$/;

  function lastTextNode(el) {
    for (var n = el.lastChild; n; n = n.previousSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return n;
      if (n.nodeType === 1 && !SKIP.test(n.tagName)) {
        var inner = lastTextNode(n);
        if (inner) return inner;
        if (n.textContent.trim()) return null;
      }
    }
    return null;
  }

  function fix(el) {
    var node = lastTextNode(el);
    if (!node) return;
    var text = node.nodeValue.replace(/\s+$/, '');
    var trail = node.nodeValue.slice(text.length);
    var i = text.lastIndexOf(' ');
    if (i < 1 || i === text.length - 1) return;
    if (el.textContent.trim().split(/\s+/).length < 3) return;
    node.nodeValue = text.slice(0, i) + ' ' + text.slice(i + 1) + trail;
  }

  function run() {
    var els = document.querySelectorAll('p,li,h1,h2,h3,h4,figcaption,summary,dd');
    for (var k = 0; k < els.length; k++) {
      if (!els[k].closest('script,style,svg')) fix(els[k]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
