export type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "field"; key: string }
  | { kind: "unary"; sign: "+" | "-"; value: FormulaNode }
  | { kind: "binary"; operator: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode };

export function parseFormula(source: string): FormulaNode {
  if (!source.trim() || source.length > 1000) throw new Error("Formula must contain at most 1000 characters");
  let offset = 0, nodes = 0;
  const skip = () => { while (/\s/.test(source[offset] ?? "") && offset < source.length) offset++; };
  const node = <T extends FormulaNode>(value: T): T => { if (++nodes > 64) throw new Error("Formula is too complex"); return value; };
  function primary(depth: number): FormulaNode {
    if (depth > 16) throw new Error("Formula nesting is too deep");
    skip();
    const token = source[offset];
    if (token === "+" || token === "-") { offset++; return node({ kind: "unary", sign: token, value: primary(depth + 1) }); }
    if (token === "(") {
      offset++; const value = expression(depth + 1); skip();
      if (source[offset++] !== ")") throw new Error("Expected closing parenthesis");
      return value;
    }
    if (token === "[") {
      const match = /^\[([a-z][a-z0-9_]{0,59})\]/.exec(source.slice(offset));
      if (!match) throw new Error("Expected a stable field key in brackets");
      offset += match[0].length; return node({ kind: "field", key: match[1]! });
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(source.slice(offset));
    if (!match || !Number.isFinite(Number(match[0]))) throw new Error("Expected a finite number or field reference");
    offset += match[0].length; return node({ kind: "number", value: Number(match[0]) });
  }
  function product(depth: number): FormulaNode {
    let left = primary(depth); skip();
    while (source[offset] === "*" || source[offset] === "/") {
      const operator = source[offset++] as "*" | "/";
      left = node({ kind: "binary", operator, left, right: primary(depth) }); skip();
    }
    return left;
  }
  function expression(depth: number): FormulaNode {
    let left = product(depth); skip();
    while (source[offset] === "+" || source[offset] === "-") {
      const operator = source[offset++] as "+" | "-";
      left = node({ kind: "binary", operator, left, right: product(depth) }); skip();
    }
    return left;
  }
  const result = expression(0); skip();
  if (offset !== source.length) throw new Error("Unsupported formula syntax");
  return result;
}

export function formulaReferences(node: FormulaNode): string[] {
  if (node.kind === "field") return [node.key];
  if (node.kind === "number") return [];
  if (node.kind === "unary") return formulaReferences(node.value);
  return [...new Set([...formulaReferences(node.left), ...formulaReferences(node.right)])];
}

export function evaluateFormula(node: FormulaNode, resolve: (key: string) => number | null): number | null {
  function evaluate(current: FormulaNode): number | null {
    if (current.kind === "number") return current.value;
    if (current.kind === "field") { const value = resolve(current.key); return value !== null && Number.isFinite(value) ? value : null; }
    if (current.kind === "unary") { const value = evaluate(current.value); return value === null ? null : current.sign === "-" ? -value : value; }
    const left = evaluate(current.left), right = evaluate(current.right);
    if (left === null || right === null || current.operator === "/" && right === 0) return null;
    switch (current.operator) {
      case "+": return left + right;
      case "-": return left - right;
      case "*": return left * right;
      case "/": return left / right;
    }
  }
  const result = evaluate(node);
  return result !== null && Number.isFinite(result) ? result : null;
}

export interface FormulaDefinition {
  key: string;
  type: string;
  configJson: string | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
}
function expressionOf(field: FormulaDefinition): string {
  const config = field.configJson ? JSON.parse(field.configJson) as { expression?: unknown } : {};
  if (typeof config.expression !== "string") throw new Error("Formula expression is required");
  return config.expression;
}

export function validateFormulaGraph(fields: FormulaDefinition[], changedKey: string, strictReferences: boolean): void {
  const byKey = new Map(fields.map(field => [field.key, field]));
  const references = new Map<string, string[]>();
  const expressions = new Map<string, FormulaNode>();
  for (const field of fields) {
    if (field.type !== "formula") continue;
    const expression = parseFormula(expressionOf(field));
    expressions.set(field.key, expression);
    const keys = formulaReferences(expression);
    if (keys.length > 16) throw new Error("Formula has too many dependencies");
    for (const key of keys) {
      const dependency = byKey.get(key);
      if (strictReferences && field.key === changedKey && (!dependency || dependency.archivedAt || dependency.deletedAt || !["number", "rating", "formula"].includes(dependency.type))) throw new Error("Formula references an unavailable numeric field");
      if (key === changedKey && dependency && !["number", "rating", "formula"].includes(dependency.type)) throw new Error("A formula still depends on this numeric field");
    }
    references.set(field.key, keys);
  }
  const heights = new Map<string, number>();
  const visiting = new Set<string>();
  function height(key: string): number {
    if (!references.has(key)) return 0;
    if (visiting.has(key)) throw new Error("Formula dependency cycle");
    if (heights.has(key)) return heights.get(key)!;
    if (visiting.size >= 8) throw new Error("Formula dependency chain is too deep");
    visiting.add(key);
    const result = 1 + Math.max(0, ...references.get(key)!.map(height));
    visiting.delete(key);
    if (result > 8) throw new Error("Formula dependency chain is too deep");
    heights.set(key, result); return result;
  }
  for (const key of references.keys()) height(key);
  const sizes = new Map<string, { nodes: number; depth: number }>();
  function size(key: string): { nodes: number; depth: number } {
    if (sizes.has(key)) return sizes.get(key)!;
    function measure(node: FormulaNode): { nodes: number; depth: number } {
      if (node.kind === "field" && expressions.has(node.key)) { const dependency = size(node.key); return { nodes: dependency.nodes + 1, depth: dependency.depth }; }
      if (node.kind === "number" || node.kind === "field") return { nodes: 1, depth: 1 };
      const children = node.kind === "unary" ? [measure(node.value)] : [measure(node.left), measure(node.right)];
      return { nodes: 1 + children.reduce((sum, child) => sum + child.nodes, 0), depth: 1 + Math.max(...children.map(child => child.depth)) };
    }
    const result = measure(expressions.get(key)!);
    if (result.nodes > 128 || result.depth > 16) throw new Error("Expanded formula is too complex");
    sizes.set(key, result); return result;
  }
  for (const key of expressions.keys()) size(key);
}

export function formulaEvaluator(fields: FormulaDefinition[]) {
  const byKey = new Map(fields.filter(field => !field.archivedAt && !field.deletedAt).map(field => [field.key, field]));
  const parsed = new Map<string, FormulaNode>();
  for (const field of byKey.values()) {
    if (field.type !== "formula") continue;
    try { parsed.set(field.key, parseFormula(expressionOf(field))); } catch { /* Corrupt stored definitions cannot execute code. */ }
  }
  return (values: Record<string, unknown>): Record<string, number | null> => {
    const result: Record<string, number | null> = {};
    const visiting = new Set<string>();
    const cache = new Map<string, number | null>();
    function resolve(key: string): number | null {
      if (cache.has(key)) return cache.get(key)!;
      const field = byKey.get(key);
      if (!field) return null;
      if (field.type === "number" || field.type === "rating") return typeof values[key] === "number" && Number.isFinite(values[key]) ? values[key] as number : null;
      if (visiting.has(key) || visiting.size >= 8) return null;
      const node = parsed.get(key);
      if (!node) return null;
      visiting.add(key); const value = evaluateFormula(node, resolve); visiting.delete(key);
      cache.set(key, value); return value;
    }
    for (const field of byKey.values()) if (field.type === "formula") result[field.key] = resolve(field.key);
    return result;
  };
}
