// Tool logic: calls the US Freelancer Tax API handler in-process (no network, no API key).
import { handle } from './lib/index.js';

async function call(path, args) {
  const res = await handle(new Request('https://local' + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(Object.entries(args || {}).filter(([, v]) => v !== undefined))) }));
  const body = await res.json();
  if (res.status !== 200) { const e = new Error(body.error || 'Request failed'); e.status = res.status; throw e; }
  return body;
}

export const estimate = a => call('/v1/estimate', a);
export const seTax = a => call('/v1/se-tax', a);
export const dueDates = a => call('/v1/due-dates', a);
export const mileage = a => call('/v1/mileage', a);
export const mileageRates = () => call('/v1/mileage/rates', {});
export const homeOffice = a => call('/v1/home-office', a);
export const retirement = a => call('/v1/retirement', a);
export const figures = () => call('/v1/figures', {});
