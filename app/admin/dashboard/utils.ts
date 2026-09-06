export function labelize(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatAdStatus(value: string) {
  if (value === 'inactive') return 'Expired';
  return labelize(value);
}

export function todayUtcInputDate() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
