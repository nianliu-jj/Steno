import { generateChangelog, generateTotalChangelog } from '../changelog';
import type { ChangelogOption } from '../changelog';

export async function genChangelog(options?: Partial<ChangelogOption>, total = false) {
  if (total) {
    await generateTotalChangelog(options);
  } else {
    await generateChangelog(options);
  }
}
