// Verbatim copy of the calculation core of the live page
// https://narwhalthepong.github.io/gumroad-license-check/self-employment-tax-calculator
// so the MCP tool and the page give the same numbers. MIT License.
var SETAX = (function () {
  var L = { year: 2026, ssBase: 184500, ssRate: 0.124, medRate: 0.029, nef: 0.9235, minSE: 400, addRate: 0.009,
    addThr: { single: 200000, hoh: 200000, qss: 200000, mfj: 250000, mfs: 125000 } };
  function r2(x) { return Math.round(x * 100) / 100; }
  function num(v, name, allowNeg) {
    var n = (v === "" || v == null) ? 0 : Number(v);
    if (!isFinite(n)) throw new Error(name + " must be a number");
    if (!allowNeg && n < 0) throw new Error(name + " can't be negative");
    return n;
  }
  function compute(o) {
    o = o || {};
    var profit = Math.max(0, num(o.netProfit, "Net profit", true));
    var w2 = num(o.w2Wages, "W-2 wages");
    var st = o.status || "single";
    if (!L.addThr.hasOwnProperty(st)) throw new Error("Unknown filing status");
    var spouse = st === "mfj" ? num(o.spouseW2, "Spouse's W-2 wages") : 0;
    var ne = profit * L.nef, below = ne < L.minSE;
    if (below) ne = 0;
    var ssRoom = Math.max(0, L.ssBase - w2), ssEarn = Math.min(ne, ssRoom);
    var ss = ssEarn * L.ssRate, med = ne * L.medRate, se = ss + med, half = se / 2;
    var wages = w2 + spouse, thr = L.addThr[st], thrLeft = Math.max(0, thr - wages);
    var addW = L.addRate * Math.max(0, wages - thr), addS = L.addRate * Math.max(0, ne - thrLeft);
    return {
      year: L.year, netProfit: r2(profit), netEarnings: r2(ne), belowMinimum: below && profit > 0,
      ssRoom: r2(ssRoom), ssEarnings: r2(ssEarn), socialSecurity: r2(ss), medicare: r2(med), seTax: r2(se),
      deductibleHalf: r2(half), threshold: thr, thresholdLeft: r2(thrLeft),
      addMedicareSE: r2(addS), addMedicareWages: r2(addW), addMedicare: r2(addS + addW),
      totalSE: r2(se + addS), quarterly: r2(se / 4), quarterlyWithAdd: r2((se + addS) / 4),
      effectiveRate: profit > 0 ? r2((se + addS) / profit * 100) : 0, limits: L
    };
  }
  return { compute: compute, LIMITS: L };
})();
export default SETAX;
