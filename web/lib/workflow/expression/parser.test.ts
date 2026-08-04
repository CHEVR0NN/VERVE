import { describe, expect, it } from 'vitest';
import { parse, ParseError } from './parser';

describe('parse', () => {
  it('parses a comparison', () => {
    expect(parse('member.dues_overdue_days > 30')).toEqual({
      kind: 'Binary', op: '>',
      left: { kind: 'FieldAccess', object: { kind: 'Identifier', name: 'member' }, property: 'dues_overdue_days' },
      right: { kind: 'Literal', value: 30 },
    });
  });

  it('gives && higher precedence than ||', () => {
    const ast = parse('a || b && c');
    expect(ast).toEqual({
      kind: 'Logical', op: '||',
      left: { kind: 'Identifier', name: 'a' },
      right: { kind: 'Logical', op: '&&', left: { kind: 'Identifier', name: 'b' }, right: { kind: 'Identifier', name: 'c' } },
    });
  });

  it('gives comparison higher precedence than equality', () => {
    const ast = parse('a > b == c');
    expect(ast).toEqual({
      kind: 'Binary', op: '==',
      left: { kind: 'Binary', op: '>', left: { kind: 'Identifier', name: 'a' }, right: { kind: 'Identifier', name: 'b' } },
      right: { kind: 'Identifier', name: 'c' },
    });
  });

  it('gives * higher precedence than +', () => {
    const ast = parse('a + b * c');
    expect(ast).toEqual({
      kind: 'Binary', op: '+',
      left: { kind: 'Identifier', name: 'a' },
      right: { kind: 'Binary', op: '*', left: { kind: 'Identifier', name: 'b' }, right: { kind: 'Identifier', name: 'c' } },
    });
  });

  it('parses a method call on a field access', () => {
    const ast = parse("member.tags.includes('vip')");
    expect(ast).toEqual({
      kind: 'Call',
      callee: {
        kind: 'FieldAccess',
        object: { kind: 'FieldAccess', object: { kind: 'Identifier', name: 'member' }, property: 'tags' },
        property: 'includes',
      },
      args: [{ kind: 'Literal', value: 'vip' }],
    });
  });

  it('parses index access', () => {
    const ast = parse('member.tags[0]');
    expect(ast).toEqual({
      kind: 'Index',
      object: { kind: 'FieldAccess', object: { kind: 'Identifier', name: 'member' }, property: 'tags' },
      index: { kind: 'Literal', value: 0 },
    });
  });

  it('parses parenthesized expressions overriding precedence', () => {
    const ast = parse('(a || b) && c');
    expect(ast).toEqual({
      kind: 'Logical', op: '&&',
      left: { kind: 'Logical', op: '||', left: { kind: 'Identifier', name: 'a' }, right: { kind: 'Identifier', name: 'b' } },
      right: { kind: 'Identifier', name: 'c' },
    });
  });

  it('parses unary ! and unary -', () => {
    expect(parse('!a')).toEqual({ kind: 'Unary', op: '!', operand: { kind: 'Identifier', name: 'a' } });
    expect(parse('-a')).toEqual({ kind: 'Unary', op: '-', operand: { kind: 'Identifier', name: 'a' } });
  });

  it('throws ParseError on an unclosed paren', () => {
    expect(() => parse('(a || b')).toThrow(ParseError);
  });

  it('throws ParseError on a dangling operator', () => {
    expect(() => parse('a &&')).toThrow(ParseError);
  });

  it('throws ParseError on trailing input', () => {
    expect(() => parse('a b')).toThrow(ParseError);
  });
});
