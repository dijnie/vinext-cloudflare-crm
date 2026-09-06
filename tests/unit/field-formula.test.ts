import { describe, expect, it } from "vitest";
import { evaluateFormula, formulaEvaluator, formulaReferences, parseFormula, validateFormulaGraph, type FormulaDefinition } from "@/lib/services/custom-fields/field-formula";

const definition = (key: string, expression?: string): FormulaDefinition => ({ key, type: expression === undefined ? "number" : "formula", configJson: expression === undefined ? null : JSON.stringify({ expression }), archivedAt: null, deletedAt: null });

describe("bounded numeric field formulas", () => {
  it("evaluates arithmetic precedence, unary parentheses, scientific literals and stable references", () => {
    const parsed = parseFormula("-([amount] + .5e2) / +2 + 3 * 4 - 1");
    expect(formulaReferences(parsed)).toEqual(["amount"]);
    expect(evaluateFormula(parsed, key => key === "amount" ? 10 : null)).toBe(-19);
    expect(formulaReferences(parseFormula("[amount]+[amount]+[rating]"))).toEqual(["amount", "rating"]);
  });
  it("rejects code, calls, loops, malformed references and nonfinite literals", () => {
    for (const source of ["", "while(1){}", "Math.max(1,2)", "process.exit()", "[x].constructor", "[bad-key]", "[x];1", "1e999", "Infinity", "NaN", "1**2", "(1+2", "[x] ? 1 : 0"]) expect(() => parseFormula(source), source).toThrow();
  });
  it("bounds source length and AST nodes", () => {
    expect(() => parseFormula("1" + " ".repeat(999))).not.toThrow();
    expect(() => parseFormula("1" + " ".repeat(1000))).toThrow();
    expect(() => parseFormula(Array(32).fill("1").join("+"))).not.toThrow();
    expect(() => parseFormula(Array(33).fill("1").join("+"))).toThrow();
    expect(() => parseFormula("(".repeat(17) + "1" + ")".repeat(17))).toThrow();
  });
  it("returns null for missing references, division by zero and final overflow", () => {
    for (const source of ["[missing]+1", "1/0", "1e308*1e308"]) expect(evaluateFormula(parseFormula(source), () => null)).toBeNull();
    expect(evaluateFormula(parseFormula("[bad]"), () => Infinity)).toBeNull();
  });
  it("permits at most sixteen distinct supported numeric dependencies", () => {
    const numbers = Array.from({ length: 17 }, (_, i) => definition(`n${i}`));
    const source = (count: number) => numbers.slice(0, count).map(field => `[${field.key}]`).join("+");
    expect(() => validateFormulaGraph([...numbers, definition("total", source(16))], "total", true)).not.toThrow();
    expect(() => validateFormulaGraph([...numbers, definition("total", source(17))], "total", true)).toThrow(/dependencies/);
    for (const dependency of [{ ...definition("n"), type: "text" }, { ...definition("n"), archivedAt: new Date() }, { ...definition("n"), deletedAt: new Date() }]) expect(() => validateFormulaGraph([dependency, definition("total", "[n]")], "total", true)).toThrow();
  });
  it("evaluates the allowed eight-formula chain and rejects deeper chains and retained cycles", () => {
    const chain = [definition("n"), ...Array.from({ length: 8 }, (_, i) => definition(`f${i}`, `[${i === 0 ? "n" : `f${i - 1}`}]+1`))];
    expect(() => validateFormulaGraph(chain, "f7", true)).not.toThrow();
    expect(formulaEvaluator(chain)({ n: 2 }).f7).toBe(10);
    expect(formulaEvaluator([...chain].reverse())({ n: 2 }).f7).toBe(10);
    expect(() => validateFormulaGraph([...chain, definition("f8", "[f7]+1")], "f8", true)).toThrow(/deep/);
    expect(() => validateFormulaGraph([definition("a", "[b]"), { ...definition("b", "[a]"), archivedAt: new Date() }], "a", false)).toThrow(/cycle/);
  });
  it("keeps unavailable or corrupt stored dependencies from producing values", () => {
    const fields = [{ ...definition("n"), archivedAt: new Date() }, definition("total", "[n]+1"), { ...definition("corrupt", "1"), configJson: '{"expression":"globalThis"}' }];
    expect(formulaEvaluator(fields)({ n: 2 })).toEqual({ total: null, corrupt: null });
  });
  it("accepts compact shared dependencies and rejects excessive expansion", () => {
    const shared = [definition("n"), definition("a", "[n]+1"), definition("b", "[a]*2"), definition("c", "[a]*3"), definition("total", "[b]+[c]")];
    expect(() => validateFormulaGraph(shared, "total", true)).not.toThrow();
    expect(formulaEvaluator(shared)({ n: 2 }).total).toBe(15);
    const expanded = [definition("n"), ...Array.from({ length: 7 }, (_, i) => definition(`d${i}`, `[${i === 0 ? "n" : `d${i - 1}`}]+[${i === 0 ? "n" : `d${i - 1}`}]`))];
    expect(() => validateFormulaGraph(expanded, "d6", true)).toThrow(/complex/);
  });

});
