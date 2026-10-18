import { tap } from 'node:test/reporters';
import path from 'node:path';

// Retain the runner's observed file inventory alongside TAP totals so a passing
// subset cannot accidentally satisfy a complete regression gate.
export default async function* validatedTap(source) {
  const files = new Set();
  async function* observed() {
    for await (const event of source) {
      if (event.type === 'test:enqueue' && /\.test\.(?:js|ts)$/.test(event.data.file ?? '')) {
        files.add(path.relative(process.cwd(), event.data.file));
      }
      yield event;
    }
  }
  yield* tap(observed());
  for (const file of [...files].sort()) yield `# forge-test-file ${JSON.stringify(file)}\n`;
}
