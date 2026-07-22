import path from "node:path";

export function portableRelativePath(root: string, target: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return validatePortableRelativePath(relative.split(path.sep).join("/"));
}

export function resolvePortableRelativePath(
  root: string,
  relativePath: string,
): string {
  const portable = validatePortableRelativePath(relativePath);
  return path.join(path.resolve(root), ...portable.split("/"));
}

export function validatePortableRelativePath(value: string): string {
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value) ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`Path is not a portable relative path: ${value}`);
  }
  return value;
}
