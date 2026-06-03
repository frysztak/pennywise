import { describe, expect, it } from "vitest";

import { evaluateAmount } from "@/shared/lib/calc-expression";

describe("evaluateAmount", () => {
  it("empty string → empty", () => {
    expect(evaluateAmount("")).toEqual({ kind: "empty" });
    expect(evaluateAmount("   ")).toEqual({ kind: "empty" });
  });

  it("plain number → number", () => {
    expect(evaluateAmount("42")).toEqual({ kind: "number", value: 42 });
    expect(evaluateAmount("42.5")).toEqual({ kind: "number", value: 42.5 });
    expect(evaluateAmount("0.99")).toEqual({ kind: "number", value: 0.99 });
  });

  it("operator precedence: 2+3*4 → 14", () => {
    const r = evaluateAmount("2+3*4");
    expect(r).toEqual({ kind: "expression", value: 14 });
  });

  it("parentheses: (10+5)*2 → 30", () => {
    expect(evaluateAmount("(10+5)*2")).toEqual({ kind: "expression", value: 30 });
  });

  it("decimals: 1.5+2.25 → 3.75", () => {
    const r = evaluateAmount("1.5+2.25");
    expect(r.kind).toBe("expression");
    if (r.kind === "expression") expect(r.value).toBeCloseTo(3.75);
  });

  it("unary minus: -5+10 → 5", () => {
    expect(evaluateAmount("-5+10")).toEqual({ kind: "expression", value: 5 });
  });

  it("whitespace tolerance: 10 + 5 → 15", () => {
    expect(evaluateAmount("10 + 5")).toEqual({ kind: "expression", value: 15 });
  });

  it("invalid: unclosed paren (10+", () => {
    expect(evaluateAmount("(10+")).toEqual({ kind: "invalid" });
  });

  it("invalid: double operator 10++2", () => {
    expect(evaluateAmount("10++2")).toEqual({ kind: "invalid" });
  });

  it("invalid: letters abc", () => {
    expect(evaluateAmount("abc")).toEqual({ kind: "invalid" });
  });

  it("invalid: division by zero 10/0", () => {
    expect(evaluateAmount("10/0")).toEqual({ kind: "invalid" });
  });

  it("subtraction: 20-8 → 12", () => {
    expect(evaluateAmount("20-8")).toEqual({ kind: "expression", value: 12 });
  });

  it("nested parens: ((2+3))*4 → 20", () => {
    expect(evaluateAmount("((2+3))*4")).toEqual({ kind: "expression", value: 20 });
  });

  it("unary plus: +5 → number 5 (no expression hint)", () => {
    const r = evaluateAmount("+5");
    expect(r.kind).toBe("expression");
    if (r.kind === "expression") expect(r.value).toBe(5);
  });
});
