import { sql, type SQL } from "drizzle-orm";
import { parseFormula, type FormulaNode } from "./field-formula";
import type { customFieldDefinition } from "@/lib/db/schema";
import type { FieldEntity } from "./field-contracts";

// Only parsed operators and fixed identifiers enter SQL syntax; values stay bound.
export function formulaExpression(fields: (typeof customFieldDefinition.$inferSelect)[], key: string, entity: FieldEntity, recordId: SQL): SQL {
  const byKey = new Map(fields.map(field => [field.key, field]));
  const anchor = sql.raw({ company: "company_id", contact: "contact_id", deal: "deal_id" }[entity]);
  const visiting = new Set<string>();
  let nodes = 0;
  const bounded = (value: SQL) => sql`(select case when calculated between -1.7976931348623157e308 and 1.7976931348623157e308 then calculated else null end from (select ${value} as calculated))`;
  function fieldValue(key: string, depth: number): SQL {
    const field = byKey.get(key);
    if (!field || field.archivedAt || field.deletedAt) return sql`null`;
    if (field.type === "number" || field.type === "rating") return sql`(select cast(v.number_value as real) from custom_field_value v
      inner join custom_field_definition f on f.id=v.field_id
      where f.id=${field.id} and f.type in ('number','rating') and f.archived_at is null and f.deleted_at is null and v.${anchor}=${recordId})`;
    if (field.type !== "formula" || visiting.has(key) || visiting.size >= 8) throw new Error("Invalid formula dependency");
    visiting.add(key);
    const config = field.configJson ? JSON.parse(field.configJson) as { expression: string } : { expression: "" };
    const result = expression(parseFormula(config.expression), depth);
    visiting.delete(key); return bounded(result);
  }
  function expression(node: FormulaNode, depth: number): SQL {
    if (++nodes > 128 || depth > 16) throw new Error("Expanded formula is too complex");
    if (node.kind === "number") return sql`cast(${node.value} as real)`;
    if (node.kind === "field") return fieldValue(node.key, depth);
    if (node.kind === "unary") return sql`(${sql.raw(node.sign)}${expression(node.value, depth + 1)})`;
    const left = expression(node.left, depth + 1), right = expression(node.right, depth + 1);
    return node.operator === "/" ? sql`(${left} / nullif(${right}, 0))` : sql`(${left} ${sql.raw(node.operator)} ${right})`;
  }
  try { return fieldValue(key, 1); }
  catch { return sql`null`; }
}
