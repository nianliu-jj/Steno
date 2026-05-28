import type { Options as ExecaOptions } from 'execa';

export async function execCommand(cmd: string, args: string[], options?: ExecaOptions): Promise<string> {
  const { execa } = await import('execa');
  const res = await execa(cmd, args, options);
  return ((res?.stdout as string)?.trim?.() as string) || '';
}

export function notNullish<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

export function partition<T>(
  array: T[],
  ...filters: Array<(e: T, idx: number, arr: T[]) => boolean>
): T[][] {
  const result: T[][] = Array.from({ length: filters.length + 1 }, () => [] as T[]);
  array.forEach((e, idx, arr) => {
    let i = 0;
    for (const filter of filters) {
      if (filter(e, idx, arr)) {
        result[i].push(e);
        return;
      }
      i += 1;
    }
    result[i].push(e);
  });
  return result;
}

export function groupBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
  groups: Record<string, T[]> = {}
): Record<string, T[]> {
  for (const item of items) {
    const v = String(item[key]);
    groups[v] ||= [];
    groups[v].push(item);
  }
  return groups;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function join(
  array: readonly string[] | undefined,
  glue: string = ', ',
  finalGlue: string = ' and '
): string {
  if (!array || array.length === 0) return '';
  if (array.length === 1) return array[0];
  if (array.length === 2) return array.join(finalGlue);
  return `${array.slice(0, -1).join(glue)}${finalGlue}${array.slice(-1)}`;
}
