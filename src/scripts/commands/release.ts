import { versionBump } from 'bumpp';

export async function release(execute = 'pnpm tsx src/scripts/bin.ts changelog', push = true) {
  await versionBump({
    files: ['**/package.json', '!**/node_modules'],
    execute,
    all: true,
    tag: true,
    commit: 'chore(projects): release v%s',
    push
  });
}
