/**
 * Where a visitor came from, kept on this device and sent with a lead.
 *
 * First party only: no cookies, no third-party script, no tracking id. A link carries ?ref=dm-ig (or the usual utm_source,
 * utm_medium, utm_campaign); the first known source is remembered for 90 days and the most recent one beside it. When a form
 * is submitted, form-guard.js adds these as hidden fields so the notification email names the channel that brought the lead.
 * Values are lowercased, limited to a-z 0-9 . _ - and cut to 40 characters, so nothing a link carries can be script or markup.
 * A visit with no ref and no referring site is "direct" and is not stored.
 *
 *   PennioSource.get()    -> {source, medium, campaign, last, landing}
 *   PennioSource.fields() -> the same, as the field names a form sends
 */
(function () {
  'use strict';
  var KEY = 'pennio.src', TTL = 90 * 864e5;
  function clean(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40); }
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  var q; try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return ''; } }; }
  var ref = clean(q.get('ref')) || clean(q.get('utm_source')), medium = clean(q.get('utm_medium')), campaign = clean(q.get('utm_campaign')), via = '';
  try {
    if (document.referrer) {
      var h = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (h && h !== location.hostname) via = clean(h);
    }
  } catch (e) {}

  var now = Date.now(), st = read();
  if (st && (!st.first || now - st.first.t > TTL)) st = null;
  var known = ref || via, touch = known ? { ref: ref || via, medium: medium || (ref ? '' : 'referral'), campaign: campaign, page: location.pathname, t: now } : null;
  if (touch) {
    if (!st) st = { first: touch, last: touch };
    else st.last = touch;
    write(st);
  }

  function get() {
    var f = st && st.first, l = st && st.last;
    return { source: f ? f.ref : 'direct', medium: f ? f.medium : '', campaign: f ? f.campaign : '', last: l ? l.ref : (f ? f.ref : 'direct'), landing: f ? f.page : '' };
  }
  function fields() {
    var g = get();
    return { source: g.source, source_medium: g.medium, source_campaign: g.campaign, source_last: g.last, source_landing: g.landing };
  }
  window.PennioSource = { get: get, fields: fields };
})();
