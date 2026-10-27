// GENERATED from the live home office deduction calculator page (staged-pages/home-office-deduction-calculator/src/ho.js). Do not edit.
/* Home office deduction: simplified vs regular method (IRS Pub. 587 (2025), Form 8829, Rev. Proc. 2013-13, irs.gov simplified option page). Checked 2026-10-20. */

  var RATE = 5, CAP = 300; // simplified option: $5 per sq ft, max 300 sq ft
  // MACRS 39-year nonresidential real property, mid-month, first-year % by month placed in service (Pub. 587 Table 2); later years 2.564%
  var FIRST_YEAR = [2.461, 2.247, 2.033, 1.819, 1.605, 1.391, 1.177, 0.963, 0.749, 0.535, 0.321, 0.107], LATER = 2.564;
  function r2(n) { return Math.round(n * 100) / 100; }
  function n(v, name, opt) {
    if ((v === undefined || v === null || v === "") && opt !== false) return 0;
    var x = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,\s]/g, ""));
    if (!isFinite(x) || x < 0) throw new Error(name + " must be a number of 0 or more.");
    return x;
  }
  function simplified(o) {
    var office = n(o.officeSqft, "Office square feet"), months = n(o.months === undefined ? 12 : o.months, "Months");
    if (months > 12 || months % 1) throw new Error("Months must be a whole number from 0 to 12.");
    var sq = Math.min(office, CAP), avg = sq * months / 12, tentative = r2(avg * RATE);
    var limit = Math.max(0, r2(n(o.grossIncome, "Gross income") - n(o.otherExpenses, "Other business expenses")));
    var hasIncome = o.grossIncome !== undefined && o.grossIncome !== "";
    var deduction = hasIncome ? Math.min(tentative, limit) : tentative;
    return { method: "simplified", avgSqft: r2(avg), cappedSqft: sq, capped: office > CAP, tentative: tentative, limit: hasIncome ? limit : null,
      deduction: r2(deduction), lost: r2(tentative - deduction) };
  }
  function regular(o) {
    var office = n(o.officeSqft, "Office square feet"), home = n(o.homeSqft, "Home square feet"), months = n(o.months === undefined ? 12 : o.months, "Months");
    if (months > 12 || months % 1) throw new Error("Months must be a whole number from 0 to 12.");
    if (!home) throw new Error("Enter the total square feet of your home.");
    if (office > home) throw new Error("The office can't be bigger than the home.");
    var pct = office / home, part = months / 12, share = pct * part;
    var mortTax = r2((n(o.mortgageInterest, "Mortgage interest") + n(o.realEstateTaxes, "Real estate taxes")) * share);
    var indirectOp = n(o.rent, "Rent") + n(o.insurance, "Insurance") + n(o.utilities, "Utilities") + n(o.repairs, "Repairs") + n(o.otherHome, "Other home expenses");
    var operating = r2(indirectOp * share + n(o.direct, "Direct expenses") + n(o.priorOperating, "Operating carryover"));
    var basis = n(o.basis, "Home basis"), m = n(o.firstMonth, "First month"), rate = 0;
    if (basis) {
      if (m % 1 || m > 12) throw new Error("First month must be 1 to 12, or 0 if the office was in use before this year.");
      rate = m ? FIRST_YEAR[m - 1] : LATER * part;
    }
    var depreciation = r2(basis * pct * rate / 100 + n(o.priorDepreciation, "Depreciation carryover"));
    var hasIncome = o.grossIncome !== undefined && o.grossIncome !== "";
    var limit = hasIncome ? Math.max(0, r2(n(o.grossIncome, "Gross income") - n(o.otherExpenses, "Other business expenses") - mortTax)) : Infinity;
    var opAllowed = r2(Math.min(operating, limit)), deprAllowed = r2(Math.min(depreciation, Math.max(0, limit - opAllowed)));
    return { method: "regular", businessPct: r2(pct * 100), mortTax: mortTax, operating: operating, depreciation: depreciation, depreciationRate: r2(rate * 1000) / 1000,
      limit: hasIncome ? limit : null, operatingAllowed: opAllowed, depreciationAllowed: deprAllowed,
      carryOperating: r2(operating - opAllowed), carryDepreciation: r2(depreciation - deprAllowed),
      deduction: r2(mortTax + opAllowed + deprAllowed) };
  }
  function compare(o) {
    var s = simplified(o), g = regular(o);
    return { simplified: s, regular: g, better: g.deduction > s.deduction ? "regular" : "simplified", difference: r2(Math.abs(g.deduction - s.deduction)) };
  }
  var HO = { RATE: RATE, CAP: CAP, FIRST_YEAR: FIRST_YEAR, LATER: LATER, simplified: simplified, regular: regular, compare: compare };
export { RATE, CAP, FIRST_YEAR, LATER, simplified, regular, compare };
