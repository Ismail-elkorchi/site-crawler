export function isRedirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}
export function resolveRedirectTarget(
  location: string,
  currentUrl: string,
): string {
  const target = new URL(location, currentUrl);
  target.hash = "";
  return target.href;
}
