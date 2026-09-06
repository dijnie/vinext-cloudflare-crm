import { sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { HttpError } from "@/lib/http/http-errors";
import type { FieldEntity } from "../custom-fields/field-contracts";
import type { Permission } from "../permissions/access-contracts";

export function modulesEnabledPredicate(entities: readonly FieldEntity[]): SQL {
  if (!entities.length) return sql`1=1`;
  return sql`not exists (select 1 from json_each(${JSON.stringify([...new Set(entities)])}) wanted
    where not exists (select 1 from module_setting m where m.entity=wanted.value and m.enabled=1))`;
}

export function moduleWritePredicate(permissions: readonly Permission[]): SQL {
  const entities: FieldEntity[] = [];
  for (const permission of permissions) {
    const [entity, action] = permission.split(".");
    if (["company", "contact", "deal", "lead"].includes(entity!) && ["create", "update", "archive", "restore", "assign", "convert"].includes(action!)) entities.push(entity as FieldEntity);
  }
  return modulesEnabledPredicate(entities);
}

export async function requireModulesEnabled(db: AppDatabase, entities: readonly FieldEntity[]) {
  const row = await db.get<{ enabled: number }>(sql`select ${modulesEnabledPredicate(entities)} as enabled`);
  if (!row?.enabled) throw new HttpError(403, "permission_required", "Module is disabled and historical records are read-only");
}

export function activityModules(anchors: { companyId?: string | null; contactId?: string | null; dealId?: string | null; leadId?: string | null }): FieldEntity[] {
  return [anchors.companyId ? "company" : null, anchors.contactId ? "contact" : null, anchors.dealId ? "deal" : null, anchors.leadId ? "lead" : null].filter((entity): entity is FieldEntity => entity !== null);
}
