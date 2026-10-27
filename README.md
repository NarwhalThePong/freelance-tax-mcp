# freelance-tax-mcp

A free Model Context Protocol (MCP) server for **US freelancer and sole-proprietor taxes in 2026**: quarterly estimated tax with the safe harbor, self-employment tax (Schedule SE, with the Additional Medicare Tax), the hourly rate you need to charge, IRS due dates, the IRS mileage deduction (including the July 1, 2026 rate change), the home office deduction, the most you can put into a SEP IRA vs a Solo 401(k), and official GSA per diem rates with the self-employed meal deduction. Everything runs locally: no API key, no account, no network calls.

## Tools

| Tool | What it does |
|---|---|
| `estimate` | 2026 federal estimate from `net_profit` (or `ytd_profit` + `months`): SE tax, income tax, QBI, safe-harbor quarterly payment and due dates. Options `filing_status`, `w2_wages`, `withholding`, `prior_year_tax`, `prior_year_agi`, `state_rate_pct`. |
| `self_employment_tax` | 2026 Schedule SE: 15.3% on 92.35% of net profit (none under $400), Social Security 12.4% up to the $184,500 wage base minus your W-2 wages, Medicare 2.9% with no cap, 0.9% Additional Medicare Tax over $200,000 / $250,000 (mfj) / $125,000 (mfs) split into the SE and wage parts, the deductible half, quarterly share and effective rate. Options `filing_status`, `w2_wages`, `spouse_w2_wages`, `ytd_profit` + `months`. |
| `freelance_hourly_rate` | Hourly and day rate needed to take home a target income after tax, business costs, weeks off, non-billable hours and a slow-month buffer; `check_rate` shows what a given rate pays per year and per hour worked. |
| `due_dates` | Quarterly estimated tax due dates for a year, moved past weekends and DC legal holidays. |
| `mileage` | Standard mileage deduction priced by the date of each trip (business 72.5 cents Jan to Jun 2026, 76 cents from Jul 1), from a trip log or split totals. |
| `mileage_rates` | IRS mileage rates by period with sources. |
| `home_office` | Simplified ($5 per sq ft, up to 300 sq ft) vs regular Form 8829 method, with the income limit and carryovers. |
| `retirement_contribution` | 2026 SEP IRA vs Solo 401(k) maximum contribution for a sole proprietor or single-member LLC (IRS Pub. 560 rate worksheet): employer share, $24,500 deferral, catch-up ($8,000 at 50+, $11,250 at 60 to 63), the $72,000 cap, which plan allows more and estimated income tax saved. Options `age_group`, `w2_wages`, `other_deferrals`, `plan_rate`, `bracket`. |
| `per_diem_rates` | Official GSA CONUS per diem rates (FY2026 and FY2027) by ZIP, city or state: lodging maximum by month and the M&IE breakdown. |
| `per_diem_trip` | Maximum per diem for a trip under GSA/FTR rules: lodging per night, M&IE with 75% on the first and last day, minus provided meals. |
| `meal_deduction` | Self-employed meal deduction with the IRS standard meal allowance (Pub. 463): federal M&IE rate, 3/4 on travel days (or full), times 50% (or 80% for DOT hours-of-service workers). |
| `mie_breakdown` | GSA meals and incidentals tiers (breakfast, lunch, dinner, incidentals, first/last day). |
| `tax_figures` | 2026 brackets, standard deductions, SE tax figures and official IRS/SSA sources. |

Figures come from IRS Rev. Proc. 2025-32, the SSA 2026 wage base ($184,500), Form 1040-ES (2026), IRS Announcement 2026-11, Pub. 587, Pub. 560, IRS Notice 2025-67 (2026 retirement plan limits), Pub. 463 and GSA per diem rates (api.gsa.gov, fetched 2026-10-20; public domain). Planning estimates only; not tax, legal or accounting advice.

## Install

Requires Node.js 18 or newer.

```bash
npx -y freelance-tax-mcp
```

Add to your MCP client's config (for Cursor, `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "freelance-tax": { "command": "npx", "args": ["-y", "freelance-tax-mcp"] }
  }
}
```

From source: `git clone https://github.com/NarwhalThePong/freelance-tax-mcp.git && cd freelance-tax-mcp && npm install && npm test`.

## Example

`estimate` with `{ "net_profit": 80000 }` (single, no other income) returns self-employment tax of $11,303.64, total 2026 federal tax of $16,647.47 and a quarterly payment of $4,161.87, with the four due dates.

`self_employment_tax` with `{ "net_profit": 250000, "w2_wages": 50000 }` (single) returns Social Security of $16,678 (only $134,500 of wage base left), Medicare of $6,695.38, self-employment tax of $23,373.38 (deductible half $11,686.69) and $727.88 of Additional Medicare Tax on the self-employment income.

`freelance_hourly_rate` with the defaults ($60,000 take-home, $6,000 costs, 30% tax, 6 weeks off, 40 hours a week, 65% billable, 10% buffer) returns $85.21 an hour ($681.64 a day) over 1,196 billable hours.

`retirement_contribution` with `{ "net_profit": 100000 }` (under 50) returns a SEP IRA maximum of $18,587.04 and a Solo 401(k) maximum of $43,087.04 ($24,500 deferral + $18,587.04 employer share).

`meal_deduction` with `{ "zip": "10001", "start": "2026-11-03", "end": "2026-11-06" }` (New York City, 4 days) returns a standard meal allowance of $322 ($69 + $92 + $92 + $69) and a 50% deduction of $161.

## Prefer a web page?

- Free 2026 self-employment tax calculator: https://narwhalthepong.github.io/gumroad-license-check/self-employment-tax-calculator
- Free freelance hourly rate calculator: https://narwhalthepong.github.io/gumroad-license-check/freelance-hourly-rate-calculator
- Free freelance quarterly estimated tax calculator: https://narwhalthepong.github.io/gumroad-license-check/freelance-quarterly-estimated-tax-calculator
- Free 2026 mileage deduction calculator: https://narwhalthepong.github.io/gumroad-license-check/2026-mileage-deduction-calculator
- Free home office deduction calculator: https://narwhalthepong.github.io/gumroad-license-check/home-office-deduction-calculator
- Free SEP IRA vs Solo 401(k) contribution calculator: https://narwhalthepong.github.io/gumroad-license-check/self-employed-retirement-contribution-calculator
- Free self-employed per diem meal deduction calculator: https://narwhalthepong.github.io/gumroad-license-check/self-employed-per-diem-meal-deduction-calculator
- Free GSA per diem calculator: https://narwhalthepong.github.io/gumroad-license-check/gsa-per-diem-calculator

**Disclosure:** these are our own free pages.

## License

MIT

<!-- mcp-name: io.github.NarwhalThePong/freelance-tax-mcp -->
