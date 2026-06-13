export type EvalResult =
  | { kind: "empty" }
  | { kind: "number"; value: number }
  | { kind: "expression"; value: number }
  | { kind: "invalid" };

type Token =
  | { type: "number"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || ch === "." || ch === ",") {
      let num = "";
      while (i < input.length && ((input[i] >= "0" && input[i] <= "9") || input[i] === "." || input[i] === ",")) {
        // Treat "," as a decimal separator, equivalent to "."
        num += input[i] === "," ? "." : input[i];
        i++;
      }
      const v = parseFloat(num);
      if (isNaN(v)) return null;
      tokens.push({ type: "number", value: v });
      continue;
    }
    return null;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  parseExpr(): number {
    let left = this.parseTerm();
    while (true) {
      const t = this.peek();
      if (t?.type === "op" && (t.value === "+" || t.value === "-")) {
        this.consume();
        const right = this.parseTerm();
        left = t.value === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseFactor();
    while (true) {
      const t = this.peek();
      if (t?.type === "op" && (t.value === "*" || t.value === "/")) {
        this.consume();
        const right = this.parseFactor();
        if (t.value === "/") {
          if (right === 0) throw new Error("div_zero");
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  }

  private parseFactor(): number {
    const t = this.peek();
    if (!t) throw new Error("unexpected end");

    if (t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.consume();
      const v = this.parseFactor();
      return t.value === "-" ? -v : v;
    }

    if (t.type === "lparen") {
      this.consume();
      const v = this.parseExpr();
      const closing = this.peek();
      if (!closing || closing.type !== "rparen") throw new Error("missing )");
      this.consume();
      return v;
    }

    if (t.type === "number") {
      this.consume();
      return t.value;
    }

    throw new Error("unexpected token");
  }

  isDone(): boolean {
    return this.pos >= this.tokens.length;
  }
}

const BARE_NUMBER_RE = /^-?\d*[.,]?\d+$/;

function isExpression(input: string): boolean {
  return !BARE_NUMBER_RE.test(input.trim());
}

export function evaluateAmount(input: string): EvalResult {
  const trimmed = input.trim();
  if (trimmed === "") return { kind: "empty" };

  const tokens = tokenize(trimmed);
  if (!tokens) return { kind: "invalid" };
  if (tokens.length === 0) return { kind: "empty" };

  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const cur = tokens[i];
    if (prev.type === "op" && cur.type === "op" && cur.value === "+") {
      return { kind: "invalid" };
    }
  }

  try {
    const parser = new Parser(tokens);
    const value = parser.parseExpr();
    if (!parser.isDone()) return { kind: "invalid" };
    if (!isFinite(value)) return { kind: "invalid" };
    return isExpression(trimmed) ? { kind: "expression", value } : { kind: "number", value };
  } catch {
    return { kind: "invalid" };
  }
}
