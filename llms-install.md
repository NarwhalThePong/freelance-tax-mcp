# llms-install.md — freelance-tax-mcp

This is a zero-config, stdio MCP server for US freelancer / sole-proprietor 2026 taxes. No API key, account, or network access is required; all figures and calculations run locally.

## Install (recommended)
Requires Node.js 18+. Add this server to the client's MCP settings and run it with npx:

```json
{
  "mcpServers": {
    "freelance-tax": {
      "command": "npx",
      "args": ["-y", "freelance-tax-mcp"]
    }
  }
}
```

No environment variables are needed.

## Verify
After setup, the server exposes tools including `estimate`, `self_employment_tax`, `qbi_deduction`, `freelance_hourly_rate`, `due_dates`, `mileage`, `home_office`, `retirement_contribution`, `per_diem_rates` and `tax_figures`. A good smoke test is calling `tax_figures` (takes no arguments) and confirming it returns the 2026 brackets, standard deductions and SE-tax figures with sources.

## From source (optional)
```bash
git clone https://github.com/NarwhalThePong/freelance-tax-mcp.git
cd freelance-tax-mcp && npm install && npm test   # tests should pass
node src/server.js
```

Note: outputs are planning estimates only and are not tax, legal or accounting advice.
