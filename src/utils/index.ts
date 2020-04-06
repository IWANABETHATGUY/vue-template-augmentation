export function isRelativePath(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../');
}