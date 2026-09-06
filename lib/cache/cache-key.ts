export function cacheKeyPart(value: unknown) {
  return encodeURIComponent(
    String(value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-'),
  );
}
