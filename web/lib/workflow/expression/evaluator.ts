import type { Expr } from './ast';
import type { EvalContext } from './context';
import { parse } from './parser';

export class EvalError extends Error {}

function toNumber(value: unknown, opDesc: string): number {
  if (typeof value !== 'number') throw new EvalError(`Expected number for ${opDesc}, got ${typeof value}`);
  return value;
}

function resolveIdentifier(name: string, context: EvalContext): unknown {
  if (!(name in context)) throw new EvalError(`Unknown identifier '${name}'`);
  return (context as unknown as Record<string, unknown>)[name];
}

function callMethod(receiver: unknown, methodName: string, args: unknown[]): unknown {
  if (methodName === 'includes' && Array.isArray(receiver)) return receiver.includes(args[0]);
  if (methodName === 'includes' && typeof receiver === 'string') return receiver.includes(String(args[0]));
  if (methodName === 'toLowerCase' && typeof receiver === 'string') return receiver.toLowerCase();
  if (methodName === 'toUpperCase' && typeof receiver === 'string') return receiver.toUpperCase();
  throw new EvalError(`Unsupported method '${methodName}' on ${typeof receiver}`);
}

export function evaluate(expr: Expr, context: EvalContext): unknown {
  switch (expr.kind) {
    case 'Literal':
      return expr.value;

    case 'Identifier':
      return resolveIdentifier(expr.name, context);

    case 'FieldAccess': {
      const object = evaluate(expr.object, context);
      if (object === null || object === undefined) {
        throw new EvalError(`Cannot read property '${expr.property}' of ${object}`);
      }
      return (object as Record<string, unknown>)[expr.property];
    }

    case 'Index': {
      const object = evaluate(expr.object, context);
      if (object === null || object === undefined) {
        throw new EvalError(`Cannot index into ${object}`);
      }
      const index = evaluate(expr.index, context) as number;
      return (object as unknown[])[index];
    }

    case 'Call': {
      if (expr.callee.kind !== 'FieldAccess') throw new EvalError('Only method calls are supported');
      const receiver = evaluate(expr.callee.object, context);
      const args = expr.args.map((a) => evaluate(a, context));
      return callMethod(receiver, expr.callee.property, args);
    }

    case 'Unary': {
      if (expr.op === '!') return !evaluate(expr.operand, context);
      return -toNumber(evaluate(expr.operand, context), "unary '-'");
    }

    case 'Logical': {
      const left = evaluate(expr.left, context);
      if (expr.op === '&&') return Boolean(left) && Boolean(evaluate(expr.right, context));
      return Boolean(left) || Boolean(evaluate(expr.right, context));
    }

    case 'Binary': {
      const left = evaluate(expr.left, context);
      const right = evaluate(expr.right, context);
      const op = expr.op;
      switch (op) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '<': return toNumber(left, "'<'") < toNumber(right, "'<'");
        case '<=': return toNumber(left, "'<='") <= toNumber(right, "'<='");
        case '>': return toNumber(left, "'>'") > toNumber(right, "'>'");
        case '>=': return toNumber(left, "'>='") >= toNumber(right, "'>='");
        case '+':
          if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
          return toNumber(left, "'+'") + toNumber(right, "'+'");
        case '-': return toNumber(left, "'-'") - toNumber(right, "'-'");
        case '*': return toNumber(left, "'*'") * toNumber(right, "'*'");
        case '/': return toNumber(left, "'/'") / toNumber(right, "'/'");
        default: {
          const _exhaustiveOp: never = op;
          throw new EvalError(`Unhandled binary operator '${_exhaustiveOp}'`);
        }
      }
    }

    default: {
      const _exhaustiveExpr: never = expr;
      throw new EvalError(`Unhandled expression kind '${_exhaustiveExpr}'`);
    }
  }
}

export function evaluateCondition(source: string, context: EvalContext): boolean {
  return Boolean(evaluate(parse(source), context));
}
