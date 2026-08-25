const SUPPORTED_LANGUAGES = new Set([
  'CSS',
  'JavaScript',
  'Prisma',
  'SQL',
  'TSX',
  'TypeScript',
]);

const KEYWORDS = new Set(
  [
    'abstract',
    'async',
    'await',
    'class',
    'const',
    'create',
    'delete',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'interface',
    'let',
    'model',
    'new',
    'null',
    'private',
    'protected',
    'public',
    'readonly',
    'return',
    'select',
    'static',
    'table',
    'throw',
    'true',
    'type',
    'undefined',
    'update',
    'where',
  ].map((value) => value.toLowerCase()),
);

function scanQuoted(text, index, quote) {
  let cursor = index + 1;
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      cursor += Math.min(2, text.length - cursor);
      continue;
    }
    if (text[cursor] === quote) return text.slice(index, cursor + 1);
    cursor += 1;
  }
  return text.slice(index);
}

function matchTokenAt(text, index, language) {
  const rest = text.slice(index);
  if (rest.startsWith('/*')) {
    const end = text.indexOf('*/', index + 2);
    return {
      type: 'comment',
      text: end === -1 ? text.slice(index) : text.slice(index, end + 2),
    };
  }
  if (
    rest.startsWith('//') &&
    ['JavaScript', 'Prisma', 'TSX', 'TypeScript'].includes(language)
  ) {
    const match = /^\/\/[^\r\n]*/.exec(rest);
    return { type: 'comment', text: match[0] };
  }
  if (rest.startsWith('--') && language === 'SQL') {
    const match = /^--[^\r\n]*/.exec(rest);
    return { type: 'comment', text: match[0] };
  }

  const character = text[index];
  if (character === "'" || character === '"' || character === '`') {
    return { type: 'string', text: scanQuoted(text, index, character) };
  }

  const decorator = /^@[A-Za-z_$][\w$]*/.exec(rest);
  if (decorator) return { type: 'decorator', text: decorator[0] };

  const number = /^(?:0[xob][0-9a-f]+|\d+(?:\.\d+)?)/i.exec(rest);
  if (number) return { type: 'number', text: number[0] };

  const identifier = /^[A-Za-z_$][\w$]*/.exec(rest);
  if (identifier && KEYWORDS.has(identifier[0].toLowerCase())) {
    return { type: 'keyword', text: identifier[0] };
  }
  if (identifier) return { type: 'plain', text: identifier[0] };

  return null;
}

function pushMerged(tokens, token) {
  const previous = tokens.at(-1);
  if (previous?.type === token.type) {
    previous.text += token.text;
    return;
  }
  tokens.push({ ...token });
}

export function joinTokenText(tokens) {
  return tokens.map(({ text }) => text).join('');
}

export function tokenizeSource(text, language) {
  if (text.length === 0) return [];
  if (!SUPPORTED_LANGUAGES.has(language)) {
    return [{ type: 'plain', text }];
  }

  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const match = matchTokenAt(text, index, language);
    const codePoint = String.fromCodePoint(text.codePointAt(index));
    const token = match ?? { type: 'plain', text: codePoint };
    pushMerged(tokens, token);
    index += token.text.length;
  }
  return tokens;
}
