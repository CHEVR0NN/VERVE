import type { Token, TokenType } from './tokens';
import { tokenize } from './tokenizer';
import type { Expr } from './ast';

export class ParseError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(`${message} at position ${pos}`);
    this.pos = pos;
  }
}

class Parser {
  private tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    return this.tokens[this.index++];
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private match(type: TokenType): Token | null {
    return this.check(type) ? this.advance() : null;
  }

  private expect(type: TokenType, message: string): Token {
    const token = this.match(type);
    if (!token) throw new ParseError(message, this.peek().pos);
    return token;
  }

  parseExpression(): Expr {
    const expr = this.orExpr();
    this.expect('EOF', 'Unexpected trailing input');
    return expr;
  }

  private orExpr(): Expr {
    let left = this.andExpr();
    while (this.match('OR')) left = { kind: 'Logical', op: '||', left, right: this.andExpr() };
    return left;
  }

  private andExpr(): Expr {
    let left = this.equality();
    while (this.match('AND')) left = { kind: 'Logical', op: '&&', left, right: this.equality() };
    return left;
  }

  private equality(): Expr {
    let left = this.comparison();
    while (this.check('EQ') || this.check('NEQ')) {
      const op = this.advance().type === 'EQ' ? '==' : '!=';
      left = { kind: 'Binary', op, left, right: this.comparison() };
    }
    return left;
  }

  private comparison(): Expr {
    let left = this.addExpr();
    const ops: Record<string, '<' | '<=' | '>' | '>='> = { LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
    while (this.check('LT') || this.check('LTE') || this.check('GT') || this.check('GTE')) {
      const op = ops[this.advance().type];
      left = { kind: 'Binary', op, left, right: this.addExpr() };
    }
    return left;
  }

  private addExpr(): Expr {
    let left = this.mulExpr();
    while (this.check('PLUS') || this.check('MINUS')) {
      const op = this.advance().type === 'PLUS' ? '+' : '-';
      left = { kind: 'Binary', op, left, right: this.mulExpr() };
    }
    return left;
  }

  private mulExpr(): Expr {
    let left = this.unary();
    while (this.check('STAR') || this.check('SLASH')) {
      const op = this.advance().type === 'STAR' ? '*' : '/';
      left = { kind: 'Binary', op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): Expr {
    if (this.match('NOT')) return { kind: 'Unary', op: '!', operand: this.unary() };
    if (this.match('MINUS')) return { kind: 'Unary', op: '-', operand: this.unary() };
    return this.primary();
  }

  private primary(): Expr {
    let expr = this.atom();
    for (;;) {
      if (this.match('DOT')) {
        const name = this.expect('IDENT', 'Expected property name after "."');
        expr = { kind: 'FieldAccess', object: expr, property: name.value };
      } else if (this.match('LBRACKET')) {
        const index = this.orExpr();
        this.expect('RBRACKET', 'Expected "]"');
        expr = { kind: 'Index', object: expr, index };
      } else if (this.match('LPAREN')) {
        const args: Expr[] = [];
        if (!this.check('RPAREN')) {
          args.push(this.orExpr());
          while (this.match('COMMA')) args.push(this.orExpr());
        }
        this.expect('RPAREN', 'Expected ")" to close call');
        expr = { kind: 'Call', callee: expr, args };
      } else {
        break;
      }
    }
    return expr;
  }

  private atom(): Expr {
    const token = this.peek();
    if (this.match('NUMBER')) return { kind: 'Literal', value: Number(token.value) };
    if (this.match('STRING')) return { kind: 'Literal', value: token.value };
    if (this.match('BOOLEAN')) return { kind: 'Literal', value: token.value === 'true' };
    if (this.match('IDENT')) return { kind: 'Identifier', name: token.value };
    if (this.match('LPAREN')) {
      const expr = this.orExpr();
      this.expect('RPAREN', 'Expected ")"');
      return expr;
    }
    throw new ParseError(`Unexpected token '${token.value || token.type}'`, token.pos);
  }
}

export function parse(source: string): Expr {
  return new Parser(tokenize(source)).parseExpression();
}
