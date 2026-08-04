export type Expr =
  | { kind: 'Logical'; op: '&&' | '||'; left: Expr; right: Expr }
  | { kind: 'Binary'; op: '==' | '!=' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/'; left: Expr; right: Expr }
  | { kind: 'Unary'; op: '!' | '-'; operand: Expr }
  | { kind: 'Literal'; value: string | number | boolean }
  | { kind: 'FieldAccess'; object: Expr; property: string }
  | { kind: 'Index'; object: Expr; index: Expr }
  | { kind: 'Identifier'; name: string }
  | { kind: 'Call'; callee: Expr; args: Expr[] };
