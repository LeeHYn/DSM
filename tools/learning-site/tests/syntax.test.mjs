import test from 'node:test';
import assert from 'node:assert/strict';

import { joinTokenText, tokenizeSource } from '../lib/syntax.mjs';

for (const sample of [
  {
    language: 'TypeScript',
    text: "@Patch(':id')\nasync update(id: string) { return 42; }\n",
  },
  { language: 'Prisma', text: 'model Task {\n  id String @id\n}\n' },
  { language: 'SQL', text: 'CREATE TABLE "Task" ("id" TEXT);\n' },
  {
    language: 'TSX',
    text: 'export const View = () => <Text>{"<ok>"}</Text>;\n',
  },
]) {
  test(`preserves every character for ${sample.language}`, () => {
    const tokens = tokenizeSource(sample.text, sample.language);

    assert.equal(joinTokenText(tokens), sample.text);
    assert.ok(tokens.every((token) => token.text.length > 0));
  });
}

test('classifies common source tokens without changing them', () => {
  const tokens = tokenizeSource(
    "// note\nexport const answer = 'ok';\n",
    'TypeScript',
  );

  assert.ok(tokens.some((token) => token.type === 'comment'));
  assert.ok(tokens.some((token) => token.type === 'keyword'));
  assert.ok(tokens.some((token) => token.type === 'string'));
  assert.equal(joinTokenText(tokens), "// note\nexport const answer = 'ok';\n");
});

test('keeps unsupported formats as one plain token', () => {
  assert.deepEqual(tokenizeSource('a: b\n', 'YAML'), [
    { type: 'plain', text: 'a: b\n' },
  ]);
});
