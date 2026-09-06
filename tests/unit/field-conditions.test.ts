import { describe, expect, it } from "vitest";
import { FIELD_TYPES } from "@/lib/services/custom-fields/field-contracts";
import { fieldCriteriaSchema, fieldCriteriaQuerySchema, fieldFilterOperators, isValidFieldCriterion } from "@/lib/services/custom-fields/field-filter-contracts";
import { assertQueryLimits } from "@/lib/db/query-limits";
import { changeListState, parseListState } from "@/lib/listing/list-state";
describe("typed condition contracts",()=>{
 it("exposes only applicable operators for all sixteen field types",()=>{
  for(const type of FIELD_TYPES){
   const expected=["number","rating","formula","date","money"].includes(type)?["eq","neq","gt","gte","lt","lte","empty","not_empty"]:["multiselect","multivalue"].includes(type)?["contains","empty","not_empty"]:["text","long_text","email","url","phone"].includes(type)?["eq","neq","contains","empty","not_empty"]:["eq","neq","empty","not_empty"];
   expect(fieldFilterOperators(type),type).toEqual(expected);
   const value=type==="money"?{amountMinor:0,currency:"USD" as const}:type==="date"?"2026-09-06":type==="checkbox"?false:["number","rating","formula"].includes(type)?0:"reference";
   for(const operator of ["eq","neq","gt","gte","lt","lte","contains","empty","not_empty"] as const) expect(isValidFieldCriterion(type,{key:"field",operator,...(["empty","not_empty"].includes(operator)?{}:{value})}),type+operator).toBe(expected.includes(operator));
  }
 });
 it("bounds JSON and typed values without coercion",()=>{
  expect(fieldCriteriaSchema.safeParse(Array(20).fill({key:"n",operator:"eq",value:0})).success).toBe(true);
  for(const input of [Array(21).fill({key:"n",operator:"empty"}),[{key:"n",operator:"eq",value:Infinity}],[{key:"n",operator:"contains",value:""}],[{key:"n",operator:"empty",value:0}],[{key:"n",operator:"eq"}],[{key:"n;drop",operator:"empty"}],[{key:"n",operator:"eq",value:"x".repeat(256)}]]) expect(fieldCriteriaSchema.safeParse(input).success).toBe(false);
  expect(fieldCriteriaQuerySchema.parse('[{"key":"n","operator":"eq","value":false}]')[0].value).toBe(false);
  for(const [type,value] of [["number","1"],["checkbox",0],["date","2026-02-30"],["money",{amountMinor:1,currency:"ZZZ"}] ] as const) expect(isValidFieldCriterion(type,{key:"n",operator:"eq",value} as never)).toBe(false);
 });
 it("preserves structurally stale criteria and resets pagination on apply or clear",()=>{
  const criteria=JSON.stringify([{key:"archived_field",operator:"eq",value:2}]);
  const search=new URLSearchParams({criteria,page:"8"});
  expect(parseListState("company",search).list.criteria).toEqual(JSON.parse(criteria));
  for(const value of [criteria,null]) expect(new URLSearchParams(changeListState(search,{criteria:value})).has("page")).toBe(false);
 });
 it("enforces parameter and UTF8 statement byte boundaries before execution",()=>{
  const query=(sql:string,count:number)=>({toSQL:()=>({sql,params:Array(count).fill(0)})});
  expect(()=>assertQueryLimits(query("x".repeat(100000),100))).not.toThrow();
  for(const q of [query("x",101),query("é".repeat(50001),0)]) expect(()=>assertQueryLimits(q)).toThrow(/too complex/);
 });
});
