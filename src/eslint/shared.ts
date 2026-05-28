export async function interopDefault<T>(m: T | Promise<T>): Promise<T> {
  const resolved = (await m) as { default?: T } & T;
  return ((resolved as { default?: T }).default || resolved) as T;
}
