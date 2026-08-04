import { describe, expect, it } from 'vitest';
import { tokenize, TokenizeError } from './tokenizer';

describe('tokenize', () => {
  it('tokenizes numbers, strings, booleans, and identifiers', () => {
    const tokens = tokenize("member.dues_overdue_days > 30 && member.tags.includes('vip')");
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      'IDENT', 'DOT', 'IDENT', 'GT', 'NUMBER', 'AND',
      'IDENT', 'DOT', 'IDENT', 'DOT', 'IDENT', 'LPAREN', 'STRING', 'RPAREN', 'EOF',
    ]);
  });

  it('tokenizes booleans as BOOLEAN not IDENT', () => {
    const tokens = tokenize('true == false');
    expect(tokens.map((t) => t.type)).toEqual(['BOOLEAN', 'EQ', 'BOOLEAN', 'EOF']);
  });

  it('tokenizes all comparison and logical operators', () => {
    const tokens = tokenize('a <= b >= c != d || e');
    expect(tokens.map((t) => t.type)).toEqual([
      'IDENT', 'LTE', 'IDENT', 'GTE', 'IDENT', 'NEQ', 'IDENT', 'OR', 'IDENT', 'EOF',
    ]);
  });

  it('tokenizes arithmetic operators', () => {
    const tokens = tokenize('a + b - c * d / e');
    expect(tokens.map((t) => t.type)).toEqual([
      'IDENT', 'PLUS', 'IDENT', 'MINUS', 'IDENT', 'STAR', 'IDENT', 'SLASH', 'IDENT', 'EOF',
    ]);
  });

  it('tokenizes negative and decimal numbers as separate MINUS + NUMBER', () => {
    const tokens = tokenize('-1.5');
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      ['MINUS', '-'], ['NUMBER', '1.5'], ['EOF', ''],
    ]);
  });

  it('throws TokenizeError on unterminated string', () => {
    expect(() => tokenize("member.name == 'vip")).toThrow(TokenizeError);
  });

  it('throws TokenizeError on an unexpected character', () => {
    expect(() => tokenize('member.name == @vip')).toThrow(TokenizeError);
  });
});
