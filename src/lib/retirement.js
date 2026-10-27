// GENERATED from the live SEP IRA vs Solo 401(k) calculator page (Site-ready/self-employed-retirement-contribution-calculator/sep.js). Do not edit.
// SEP IRA vs Solo 401(k) max contribution, 2026, sole proprietor / single-member LLC (Pub. 560 rate worksheet)
var SEP = (function () {
  var L = { year: 2026, ssBase: 184500, ssRate: 0.124, medRate: 0.029, nef: 0.9235, minSE: 400,
    total415: 72000, deferral: 24500, compCap: 360000, catch50: 8000, catch6063: 11250 };
  function r2(x) { return Math.round(x * 100) / 100; }
  function num(v, name) { var n = Number(v); if (!isFinite(n) || n < 0) throw new Error(name + " must be a number 0 or more"); return n; }
  function seTax(profit, w2ss) {
    var base = profit * L.nef;
    if (base < L.minSE) return { base: r2(base), ss: 0, medicare: 0, total: 0, half: 0 };
    var ss = L.ssRate * Math.min(base, Math.max(0, L.ssBase - w2ss)), med = L.medRate * base;
    var t = ss + med;
    return { base: r2(base), ss: r2(ss), medicare: r2(med), total: r2(t), half: r2(t / 2) };
  }
  function compute(o) {
    o = o || {};
    var profit = num(o.netProfit == null ? 0 : o.netProfit, "Net profit");
    var w2ss = num(o.w2Wages || 0, "W-2 wages");
    var otherDef = num(o.otherDeferrals || 0, "Other 401(k) deferrals");
    var ratePct = num(o.planRate == null ? 25 : o.planRate, "Plan rate");
    if (ratePct > 25) throw new Error("Plan rate can't be more than 25%");
    var bracket = num(o.bracket == null ? 22 : o.bracket, "Tax bracket");
    var age = o.age || "under50";
    var se = seTax(profit, w2ss);
    var earned = Math.max(0, profit - se.half);
    var r = ratePct / 100, rr = r / (1 + r);
    var employer = Math.min(earned * rr, L.compCap * r, L.total415);
    var sep = r2(employer);
    var defRoom = Math.max(0, L.deferral - otherDef);
    var deferral = Math.min(defRoom, Math.max(0, earned - employer), Math.max(0, L.total415 - employer));
    var catchLim = age === "60to63" ? L.catch6063 : age === "50plus" ? L.catch50 : 0;
    var catchup = Math.min(catchLim, Math.max(0, earned - employer - deferral));
    var solo = r2(employer + deferral + catchup);
    var better = solo > sep ? "solo401k" : "equal";
    return {
      year: L.year, netProfit: profit, seTax: se, earnedIncome: r2(earned), reducedRatePct: r2(rr * 100),
      sep: { employer: sep, total: sep },
      solo401k: { employer: r2(employer), deferral: r2(deferral), catchup: r2(catchup), total: solo },
      better: better, difference: r2(solo - sep),
      taxSaved: { sep: r2(sep * bracket / 100), solo401k: r2(solo * bracket / 100) }, limits: L
    };
  }
  return { compute: compute, seTax: seTax, LIMITS: L };
})();
export const compute = SEP.compute, LIMITS = SEP.LIMITS;
