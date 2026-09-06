export function getClientIp(requestHeaders: Headers): string | null {
  return (
    requestHeaders.get('cf-connecting-ip') ||
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    requestHeaders.get('x-real-ip') ||
    null
  );
}
