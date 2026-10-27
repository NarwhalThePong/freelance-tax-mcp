// GENERATED from the live mileage calculator page (staged-pages/mileage-deduction-calculator/src/mil.js). Do not edit.
/* IRS standard mileage rates by date (irs.gov standard mileage rates table, Announcement 2026-11, IR-2026-29, IR-2025-128, IR-2024-312). Checked 2026-10-20. */
  // cents per mile; each period applies to miles driven from `from` to `to` inclusive
  var RATES = [
    { from: "2025-01-01", to: "2025-12-31", label: "2025", business: 70, medical: 21, moving: 21, charity: 14, source: "IR-2024-312" },
    { from: "2026-01-01", to: "2026-06-30", label: "Jan 1 to Jun 30, 2026", business: 72.5, medical: 20.5, moving: 20.5, charity: 14, source: "IR-2025-128" },
    { from: "2026-07-01", to: "2026-12-31", label: "Jul 1 to Dec 31, 2026", business: 76, medical: 23.5, moving: 23.5, charity: 14, source: "IR-2026-29, Announcement 2026-11" }
  ];
  var PURPOSES = ["business", "medical", "moving", "charity"];
  var ALIAS = { business: "business", work: "business", biz: "business", b: "business", medical: "medical", med: "medical", m: "medical",
    moving: "moving", military: "moving", move: "moving", charity: "charity", charitable: "charity", volunteer: "charity", c: "charity" };
  function r2(n) { return Math.round(n * 100) / 100; }
  function parse(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || "").trim()) || /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
    if (!m) throw new Error("Use dates like 2026-07-15 or 7/15/2026: " + s);
    var y, mo, d;
    if (m[0].indexOf("/") > 0) { y = +m[3]; mo = +m[1]; d = +m[2]; } else { y = +m[1]; mo = +m[2]; d = +m[3]; }
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw new Error("Not a real date: " + s);
    return dt.toISOString().slice(0, 10);
  }
  function period(date) {
    var iso = parse(date);
    for (var i = 0; i < RATES.length; i++) if (iso >= RATES[i].from && iso <= RATES[i].to) return RATES[i];
    throw new Error("Rates here cover trips from Jan 1, 2025 to Dec 31, 2026. " + iso + " is outside that.");
  }
  function purpose(p) {
    var k = ALIAS[String(p || "business").trim().toLowerCase()];
    if (!k) throw new Error("Purpose must be business, medical, moving (military only) or charity: " + p);
    return k;
  }
  function miles(n) {
    var v = typeof n === "number" ? n : parseFloat(String(n == null ? "" : n).replace(/,/g, ""));
    if (!(v >= 0) || !isFinite(v)) throw new Error("Miles must be a number of 0 or more: " + n);
    return v;
  }
  function blank() { var o = {}; PURPOSES.forEach(function (p) { o[p] = { miles: 0, amount: 0 }; }); return o; }
  // trips: [{ date, miles, purpose }] -> per-period and per-purpose totals
  function trips(list) {
    var byPeriod = {}, byPurpose = blank(), rows = [];
    (list || []).forEach(function (t) {
      var P = period(t.date), k = purpose(t.purpose), mi = miles(t.miles), rate = P[k], amt = r2(mi * rate / 100);
      rows.push({ date: parse(t.date), miles: mi, purpose: k, rate: rate, period: P.label, amount: amt });
      var bp = byPeriod[P.label] || (byPeriod[P.label] = { label: P.label, from: P.from, rates: P, totals: blank() });
      bp.totals[k].miles += mi; bp.totals[k].amount += mi * rate / 100;
      byPurpose[k].miles += mi; byPurpose[k].amount += mi * rate / 100;
    });
    var periods = Object.keys(byPeriod).map(function (k) { return byPeriod[k]; }).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    periods.forEach(function (bp) { PURPOSES.forEach(function (p) { bp.totals[p].miles = r2(bp.totals[p].miles); bp.totals[p].amount = r2(bp.totals[p].amount); }); });
    var total = 0;
    PURPOSES.forEach(function (p) { byPurpose[p].miles = r2(byPurpose[p].miles); byPurpose[p].amount = r2(byPurpose[p].amount); total += byPurpose[p].amount; });
    return { rows: rows, periods: periods, purposes: byPurpose, total: r2(total) };
  }
  // 2026 split totals: { business: [milesJanJun, milesJulDec], medical: [...], ... }
  function split2026(o) {
    var list = [];
    PURPOSES.forEach(function (p) {
      var v = (o && o[p]) || [0, 0];
      if (miles(v[0] || 0)) list.push({ date: "2026-03-01", miles: v[0], purpose: p });
      if (miles(v[1] || 0)) list.push({ date: "2026-09-01", miles: v[1], purpose: p });
    });
    return trips(list);
  }
  // "date, miles, purpose" per line (comma, tab or semicolon); a header line is skipped
  function parseLog(text) {
    var out = [], errors = [];
    String(text || "").split(/\r?\n/).forEach(function (line, i) {
      var s = line.trim(); if (!s || s.charAt(0) === "#") return;
      var f = s.split(/\s*[,\t;]\s*/);
      if (i === 0 && /date/i.test(f[0])) return;
      try { out.push({ date: parse(f[0]), miles: miles(f[1]), purpose: purpose(f[2] || "business") }); }
      catch (e) { errors.push("Line " + (i + 1) + ": " + e.message); }
    });
    return { trips: out, errors: errors };
  }
  var MIL = { RATES: RATES, PURPOSES: PURPOSES, period: period, trips: trips, split2026: split2026, parseLog: parseLog };
export { RATES, PURPOSES, period, trips, split2026, parseLog };
