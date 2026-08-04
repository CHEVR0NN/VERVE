export type TokenType =
  | 'NUMBER' | 'STRING' | 'BOOLEAN' | 'IDENT'
  | 'DOT' | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET' | 'COMMA'
  | 'AND' | 'OR' | 'NOT'
  | 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}
