const adaFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ADA amount with thousands separators and 2 decimals, for example "1,234.57". */
export function formatAda(ada: string | number | null | undefined): string {
  if (ada === null || ada === undefined || ada === '') return '—';
  const value = typeof ada === 'number' ? ada : Number(ada);
  return Number.isFinite(value) ? adaFormat.format(value) : '—';
}

/** Shortens a long address to its start and end, for example "addr_test1qqg3...3qwzdgzn". */
export function shortAddress(address: string | null | undefined, head = 14, tail = 8): string {
  if (!address) return '—';
  return address.length > head + tail + 3
    ? `${address.slice(0, head)}...${address.slice(-tail)}`
    : address;
}
