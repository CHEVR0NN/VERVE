import type { Token, TokenType } from './tokens';

const SINGLE_CHAR: Record<string, TokenType> = {
  '.': 'DOT', '(': 'LPAREN', ')': 'RPAREN', '[': 'LBRACKET', ']': 'RBRACKET', ',': 'COMMA',
  '+': 'PLUS', '-': 'MINUS', '*': 'STAR', '/': 'SLASH',
};

export class TokenizeError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(`${message} at position ${pos}`);
    this.pos = pos;
  }
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '&' && source[i + 1] === '&') {
      tokens.push({ type: 'AND', value: '&&', pos: i });
      i += 2;
      continue;
    }
    if (ch === '|' && source[i + 1] === '|') {
      tokens.push({ type: 'OR', value: '||', pos: i });
      i += 2;
      continue;
    }
    if (ch === '=' && source[i + 1] === '=') {
      tokens.push({ type: 'EQ', value: '==', pos: i });
      i += 2;
      continue;
    }
    if (ch === '!' && source[i + 1] === '=') {
      tokens.push({ type: 'NEQ', value: '!=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '<' && source[i + 1] === '=') {
      tokens.push({ type: 'LTE', value: '<=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '>' && source[i + 1] === '=') {
      tokens.push({ type: 'GTE', value: '>=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '<') {
      tokens.push({ type: 'LT', value: '<', pos: i });
      i++;
      continue;
    }
    if (ch === '>') {
      tokens.push({ type: 'GT', value: '>', pos: i });
      i++;
      continue;
    }
    if (ch === '!') {
      tokens.push({ type: 'NOT', value: '!', pos: i });
      i++;
      continue;
    }

    if (ch in SINGLE_CHAR) {
      tokens.push({ type: SINGLE_CHAR[ch], value: ch, pos: i });
      i++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let value = '';
      while (j < source.length && source[j] !== quote) {
        value += source[j];
        j++;
      }
      if (j >= source.length) throw new TokenizeError('Unterminated string literal', i);
      tokens.push({ type: 'STRING', value, pos: i });
      i = j + 1;
      continue;
    }

    if (isDigit(ch)) {
      let j = i;
      while (j < source.length && (isDigit(source[j]) || source[j] === '.')) j++;
      tokens.push({ type: 'NUMBER', value: source.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i;
      while (j < source.length && isIdentPart(source[j])) j++;
      const value = source.slice(i, j);
      if (value === 'true' || value === 'false') tokens.push({ type: 'BOOLEAN', value, pos: i });
      else tokens.push({ type: 'IDENT', value, pos: i });
      i = j;
      continue;
    }

    throw new TokenizeError(`Unexpected character '${ch}'`, i);
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}
