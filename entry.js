/**
 * Pennio entries.
 *
 * One path for every public entry form (Ojú Gbooro casting, Ilé Eré stories,
 * and any track added later). Each entry gets the same professional handling:
 *
 *  1. A reference, e.g. FAA-1115-K7Q2: track code, month and day, four random
 *     characters. It goes in the subject line (so the inbox can be searched by
 *     it), in the table body, on the confirmation screen and in the reply the
 *     sender receives.
 *  2. An automatic acknowledgement emailed to the sender (FormSubmit
 *     `_autoresponse`) when they left an email: who it is from, the reference,
 *     what happens next and by when, what I will not do without asking.
 *  3. An on-screen confirmation with the same reference, for senders who gave
 *     only a phone number.
 *
 * To add a track: add an entry to TRACKS below with a code, a label, a subject
 * line builder and the acknowledgement text. Nothing else changes.
 *
 * Whoever edits REPLY_DAYS is promising that number of days to every sender.
 * Do not raise a figure here that the inbox cannot keep.
 */
(function () {
  "use strict";

  var FS = "https://formsubmit.co/ajax/385f3fed9367873e3a24fa92c673e010";
  var REPLY_DAYS = 14;
  var SIGN = "Paul Oyatowo, PENNIO";
  var CONTACT = "contact@pennio.agency";

  function first(name) {
    var n = String(name || "").trim().split(/\s+/)[0];
    return n || "friend";
  }

  var TRACKS = {
    ojugbooro: {
      code: "OJG",
      label: "Ojú Gbooro casting",
      page: "pennio.agency/oju-gbooro",
      subject: function (f) { return f.role + ", " + f.name; },
      ack: function (f, ref) {
        return [
          "Ẹ ṣé, " + first(f.name) + ". Your Ojú Gbooro entry is in.",
          "",
          "Reference: " + ref,
          "Entry: " + f.role,
          "",
          "I read every entry myself. If your work fits what I am casting, I will reach you by phone, WhatsApp or email within " + REPLY_DAYS + " days. If it does not fit this round, I will tell you that too.",
          "",
          "Your photos and details stay with me. I will not post, share or publish anything of yours without asking you first.",
          "",
          "If you need to correct or add something, write to " + CONTACT + " and quote the reference.",
          "",
          "Òòyà á yà.",
          SIGN
        ].join("\n");
      },
      lines: function (f) {
        var a = ["Role: " + f.role, "Name: " + f.name, "City: " + f.city, "Phone: " + f.phone, "Email: " + f.email, "Photos: " + f.photos];
        if (f.role !== "Model") a.push("Styles: " + f.styles, "Years doing hair: " + f.years_doing_hair);
        a.push("Aged 18 or older: yes");
        return a;
      }
    },
    faajiplace: {
      code: "FAA",
      label: "Ilé Eré story",
      page: "pennio.agency/faajiplace/send",
      subject: function (f) { return f.title + ", " + f.name; },
      ack: function (f, ref) {
        return [
          "Ẹ ṣé, " + first(f.name) + ". Your story is in.",
          "",
          "Reference: " + ref,
          "Title: " + f.title,
          "Format: " + f.format,
          "",
          "I read every story myself, from the first line to the last. Within " + REPLY_DAYS + " days I will write back to say whether I want to talk with you about it. You will hear from me either way.",
          "",
          "The story stays yours. Sending it gives Ilé Eré no rights to it. I will not share it, post it or make anything from it without your written agreement.",
          "",
          "If you want to add to it or take it back, write to " + CONTACT + " and quote the reference.",
          "",
          SIGN
        ].join("\n");
      },
      lines: function (f) {
        return ["Title: " + f.title, "Format: " + f.format, "Language: " + f.language, "Stage: " + f.stage, "Name: " + f.name, "Email: " + f.email, "City or country: " + f.city, "Link: " + f.link];
      }
    }
  };

  function makeRef(code) {
    var set = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", out = "", i;
    var buf = new Uint8Array(4);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (i = 0; i < 4; i++) out += set.charAt(buf[i] % set.length);
    var d = new Date();
    var md = ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
    return code + "-" + md + "-" + out;
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /**
   * send(track, fields) -> Promise<{ok, ref}>
   * fields must include name; email is optional but is what triggers the
   * acknowledgement. Extra keys travel as table rows in the notification.
   */
  function send(track, fields) {
    var t = TRACKS[track];
    if (!t) return Promise.reject(new Error("Unknown entry track: " + track));
    var ref = makeRef(t.code);
    var body = {
      _subject: "[" + ref + "] " + t.label + ": " + t.subject(fields),
      _captcha: "false",
      _template: "table",
      reference: ref,
      track: t.label,
      page: t.page,
      submitted: new Date().toISOString()
    };
    Object.keys(fields).forEach(function (k) { body[k] = fields[k]; });
    if (fields.email && EMAIL_RE.test(fields.email)) body._autoresponse = t.ack(fields, ref);
    return fetch(FS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        return { ok: res.ok && d.success !== "false" && d.success !== false, ref: ref };
      });
    }).catch(function () { return { ok: false, ref: ref }; });
  }

  /** mailto fallback for a failed send; the reference is already in the subject. */
  function mailto(track, fields, ref) {
    var t = TRACKS[track];
    var lines = [t.label + " entry", "Reference: " + ref, ""].concat(t.lines(fields));
    return "mailto:" + CONTACT + "?subject=" + encodeURIComponent("[" + ref + "] " + t.label + ": " + t.subject(fields)) +
      "&body=" + encodeURIComponent(lines.join("\n"));
  }

  window.PennioEntry = { send: send, mailto: mailto, tracks: TRACKS, replyDays: REPLY_DAYS };
})();
