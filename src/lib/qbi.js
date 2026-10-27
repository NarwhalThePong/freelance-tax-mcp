// Verbatim copy of the calculation core of the live page
// https://narwhalthepong.github.io/gumroad-license-check/qbi-deduction-calculator
// so the MCP tool and the page give the same numbers. MIT License.
// 2026 Section 199A QBI deduction (Form 8995 / 8995-A), one trade or business
var QBI = (function () {
  var L = {
    year: 2026,
    thr: { single: 201750, hoh: 201750, qss: 201750, mfj: 403500, mfs: 201775 },
    upper: { single: 276750, hoh: 276750, qss: 276750, mfj: 553500, mfs: 276775 }
  };
  function r2(x) { return Math.round(x * 100) / 100; }
  function num(v, name, allowNeg) {
    var n = (v === "" || v == null) ? 0 : Number(v);
    if (!isFinite(n)) throw new Error(name + " must be a number");
    if (!allowNeg && n < 0) throw new Error(name + " can't be negative");
    return n;
  }
  function wageLimit(w2, ubia) {
    return Math.max(0.5 * w2, 0.25 * w2 + 0.025 * ubia);
  }
  function compute(o) {
    o = o || {};
    var qbi = Math.max(0, num(o.qbi, "QBI", true));
    var ti = Math.max(0, num(o.ti, "Taxable income", true));
    var st = o.status || "single";
    if (!L.thr.hasOwnProperty(st)) throw new Error("Unknown filing status");
    var sstb = (o.sstb === true || o.sstb === "yes" || o.sstb === "true");
    var w2 = num(o.w2, "W-2 wages");
    var ubia = num(o.ubia, "UBIA");
    var reit = num(o.reit, "REIT/PTP income");
    var cg = num(o.cg, "Net capital gain");
    var thr = L.thr[st], upper = L.upper[st], range = upper - thr;
    var cap = 0.2 * Math.max(0, ti - cg);
    var zone, appPct = 1, qbiEff = qbi, w2Eff = w2, ubiaEff = ubia;
    var tentative, wLim, reduction = 0, qbiComp, reitComp, deduction, form;

    if (ti <= thr) {
      zone = "below";
      form = "8995";
      tentative = 0.2 * qbi;
      wLim = null;
      qbiComp = tentative;
      reitComp = 0.2 * reit;
      deduction = Math.min(qbiComp + reitComp, cap);
    } else if (ti >= upper) {
      zone = "above";
      form = "8995-A";
      if (sstb) {
        appPct = 0;
        qbiEff = 0; w2Eff = 0; ubiaEff = 0;
        tentative = 0; wLim = 0; qbiComp = 0;
      } else {
        tentative = 0.2 * qbi;
        wLim = wageLimit(w2, ubia);
        qbiComp = Math.min(tentative, wLim);
      }
      reitComp = 0.2 * reit;
      deduction = Math.min(qbiComp + reitComp, cap);
    } else {
      zone = "phasein";
      form = "8995-A";
      var excess = ti - thr;
      var redPct = excess / range;
      appPct = sstb ? (1 - redPct) : 1;
      qbiEff = qbi * appPct;
      w2Eff = w2 * appPct;
      ubiaEff = ubia * appPct;
      tentative = 0.2 * qbiEff;
      wLim = wageLimit(w2Eff, ubiaEff);
      reduction = redPct * Math.max(0, tentative - wLim);
      qbiComp = Math.max(0, tentative - reduction);
      reitComp = 0.2 * reit;
      deduction = Math.min(qbiComp + reitComp, cap);
    }
    return {
      year: L.year, qbi: r2(qbi), taxableIncome: r2(ti), status: st, sstb: sstb,
      threshold: thr, upper: upper, phaseRange: range, zone: zone, form: form,
      applicablePct: r2(appPct * 100), qbiEffective: r2(qbiEff),
      tentative: r2(tentative), wageLimit: wLim == null ? null : r2(wLim),
      reduction: r2(reduction), qbiComponent: r2(qbiComp), reitComponent: r2(reitComp),
      taxableIncomeCap: r2(cap), deduction: r2(deduction),
      effectiveRate: qbi > 0 ? r2(deduction / qbi * 100) : 0, limits: L
    };
  }
  return { compute: compute, LIMITS: L, wageLimit: wageLimit };
})();
export default QBI;
