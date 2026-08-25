const TYPESCRIPT_LANGUAGES = new Set(['TypeScript', 'TSX', 'JavaScript']);
const METHOD_BLOCKLIST = new Set([
  'catch',
  'for',
  'if',
  'switch',
  'while',
]);

const DECLARATION_RULES = [
  ['class', /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/],
  ['interface', /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/],
  ['type', /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/],
  ['enum', /^\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/],
  ['function', /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/],
  ['function', /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/],
];

const METHOD_PATTERN =
  /^\s*(?:(?:public|private|protected|static|readonly|abstract|override)\s+)*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={]+)?\s*\{/;
const TEST_PATTERN = /^\s*(?:describe|it|test)\s*\(\s*['"`]([^'"`]+)['"`]/;
const PRISMA_PATTERN = /^\s*(model|enum)\s+([A-Za-z_$][\w$]*)/;

function addSymbol(output, seen, kind, name, line) {
  const key = `${kind}:${name}:${line}`;
  if (seen.has(key)) return;
  seen.add(key);
  output.push(Object.freeze({ kind, name, line }));
}

export function extractSymbols(record) {
  const output = [];
  const seen = new Set();
  const lines = String(record.text).split(/\r\n|\n|\r/);

  if (record.language === 'Prisma') {
    lines.forEach((line, index) => {
      const match = PRISMA_PATTERN.exec(line);
      if (match) addSymbol(output, seen, match[1] === 'model' ? 'model' : 'enum', match[2], index + 1);
    });
    return output;
  }

  if (!TYPESCRIPT_LANGUAGES.has(record.language)) return output;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const testMatch = TEST_PATTERN.exec(line);
    if (testMatch) {
      addSymbol(output, seen, 'test', testMatch[1], lineNumber);
      return;
    }

    for (const [kind, pattern] of DECLARATION_RULES) {
      const match = pattern.exec(line);
      if (match) {
        addSymbol(output, seen, kind, match[1], lineNumber);
        return;
      }
    }

    const methodMatch = METHOD_PATTERN.exec(line);
    if (methodMatch && !METHOD_BLOCKLIST.has(methodMatch[1])) {
      addSymbol(output, seen, 'method', methodMatch[1], lineNumber);
    }
  });

  return output;
}
