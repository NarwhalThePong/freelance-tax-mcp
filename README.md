# freelance-tax-mcp

A free Model Context Protocol (MCP) server for **US freelancer and sole-proprietor taxes in 2026**: quarterly estimated tax with the safe harbor, self-employment tax, IRS due dates, the IRS mileage deduction (including the July 1, 2026 rate change) and the home office deduction. Everything runs locally: no API key, no account, no network calls.

## Tools

| Tool | What it does |
|---|---|
| `estimate` | 2026 federal estimate from `net_profit` (or `ytd_profit` + `months`): SE tax, income tax, QBI, safe-harbor quarterly payment and due dates. Options `filing_status`, `w2_wages`, `withholding`, `prior_year_tax`, `prior_year_agi`, `state_rate_pct`. |
| `self_employment_tax` | Social Security and Medicare tax on net profit, the deductible half and Additional Medicare Tax. |
| `due_dates` | Quarterly estimated tax due dates for a year, moved past weekends and DC legal holidays. |
| `mileage` | Standard mileage deduction priced by the date of each trip (business 72.5 cents Jan to Jun 2026, 76 cents from Jul 1), from a trip log or split totals. |
| `mileage_rates` | IRS mileage rates by period with sources. |
| `home_office` | Simplified ($5 per sq ft, up to 300 sq ft) vs regular Form 8829 method, with the income limit and carryovers. |
| `tax_figures` | 2026 brackets, standard deductions, SE tax figures and official IRS/SSA sources. |

Figures come from IRS Rev. Proc. 2025-32, the SSA 2026 wage base ($184,500), Form 1040-ES (2026), IRS Announcement 2026-11 and Pub. 587. Planning estimates only; not tax, legal or accounting advice.

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

## Prefer a web page?

- Free freelance quarterly estimated tax calculator: https://narwhalthepong.github.io/gumroad-license-check/freelance-quarterly-estimated-tax-calculator
- Free 2026 mileage deduction calculator: https://narwhalthepong.github.io/gumroad-license-check/2026-mileage-deduction-calculator
- Free home office deduction calculator: https://narwhalthepong.github.io/gumroad-license-check/home-office-deduction-calculator

**Disclosure:** these are our own free pages.

## License

MIT

<!-- mcp-name: io.github.NarwhalThePong/freelance-tax-mcp -->
