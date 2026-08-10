import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function findTestRoutes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return findTestRoutes(path);
    }

    return /\.test\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

it('keeps Jest files outside the Expo Router app directory', () => {
  expect(findTestRoutes(join(process.cwd(), 'src', 'app'))).toEqual([]);
});
