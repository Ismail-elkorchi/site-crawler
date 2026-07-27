export function pathSegments(url: URL): number {
  return url.pathname.split("/").filter((segment) => segment.length > 0).length;
}
export function queryParamCount(url: URL): number {
  return [...url.searchParams.keys()].length;
}
export function directoryOf(pathname: string): string {
  const index = pathname.lastIndexOf("/");
  return index <= 0 ? "/" : pathname.slice(0, index + 1);
}
export function pathPattern(pathname: string): string {
  return pathname.split("/").map(patternSegment).join("/");
}
export function queryPattern(url: URL): string {
  return [...url.searchParams.keys()].sort().join("&");
}
function patternSegment(segment: string): string {
  if (/^\d+$/u.test(segment)) return ":number";
  return segment.length > 24 ? ":long" : segment;
}
