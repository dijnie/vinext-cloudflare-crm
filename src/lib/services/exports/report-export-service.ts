import { strToU8, zipSync } from "fflate";
import type { AppDatabase } from "@/lib/db/database";
import type { RequestContext } from "@/lib/http/request-context";
import { requirePermission } from "../permissions/permission-policy";
import { ReportService } from "../reports/report-service";
import type { ReportInput } from "../reports/report-contracts";

const xml = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const safeText = (value: unknown) => /^[=+\-@]/.test(String(value)) ? `'${String(value)}` : String(value);
const columnName = (index: number) => { let result = ""; for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result; return result; };
const cell = (value: unknown, column: number, row: number) => `<c r="${columnName(column)}${row}" t="inlineStr"><is><t xml:space="preserve">${xml(safeText(value))}</t></is></c>`;
function worksheet(rows: unknown[][]) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((values, index) => `<row r="${index + 1}">${values.map((value, column) => cell(value, column, index + 1)).join("")}</row>`).join("")}</sheetData></worksheet>`; }

export class ReportExportService {
  private readonly reports: ReportService;
  constructor(db: AppDatabase, reports = new ReportService(db)) { this.reports = reports; this.db = db; }
  private readonly db: AppDatabase;

  async excel(context: RequestContext, input: ReportInput) {
    await requirePermission(this.db, context, ["report.export"]);
    const report = await this.reports.summary(context, input);
    const rows: unknown[][] = [
      ["CRM report", `${report.input.from} — ${report.input.to}`, report.input.scope, report.input.scopeId ?? "", report.reportingCurrency],
      ["Definition", report.definition],
      ["Filters", "Source", report.input.source ?? "All", "Recorded by", report.input.recorderUserId ?? "All"],
      [], ["Sales metric", "Value"],
      ["Confirmed orders", report.sales.confirmedOrders], ["Completed orders", report.sales.completedOrders], ["Cancelled orders", report.sales.cancelledOrders],
      ["Completed order value", report.sales.orderValueMinor], ["Tax", report.sales.taxMinor], ["Average order value", report.sales.averageOrderMinor ?? "No basis"], ["Receivable", report.sales.receivableMinor], ["Adjustments", report.sales.adjustmentMinor], ["Adjustment tax", report.sales.adjustmentTaxMinor],
      ["Collections", report.sales.collectionsMinor], ["Refunds", report.sales.refundsMinor], ["Net collection", report.sales.netCollectionMinor],
      ["Gross profit", report.sales.grossProfitMinor ?? "Insufficient cost data"], ["Cost coverage", report.coverage.costCoverage ?? "No basis"],
      ["Included orders", report.coverage.includedOrders], ["Excluded orders", report.coverage.excludedOrders], ["Excluded currencies", report.coverage.excludedCurrencies.join(", ")],
      [], ["Comparison", "Value"], ["Previous period", `${report.comparison.previousFrom} — ${report.comparison.previousTo}`], ["Current", report.comparison.currentMinor], ["Previous", report.comparison.previousMinor], ["Change rate", report.comparison.changeRate ?? "No basis"],
      [], ["Goal", "Value"], ["Scope", report.goal?.scopeKind ?? "No goal"], ["Amount", report.goal?.amountMinor ?? ""], ["Progress rate", report.goal?.progressRate ?? "No basis"],
      [], ["Customer metric", "Value"], ["Buying contacts", report.customers.buyingContacts], ["Total purchase", report.customers.totalPurchaseMinor], ["Net collection", report.customers.netCollectionMinor], ["Repeat-window contacts", report.customers.repeatWindowContacts], ["Repeat contacts", report.customers.repeatContacts], ["Repeat rate", report.customers.repeatRate ?? "No basis"],
      [], ["Lead metric", "Value"], ["Cohort", report.leads.cohort], ["Converted from cohort", report.leads.convertedFromCohort], ["Cohort rate", report.leads.cohortRate ?? "No basis"], ["Converted in period", report.leads.convertedInPeriod],
      [], ["Work metric", "Value"], ...Object.entries(report.work),
      [], ["Age group", "Count", "Rate"], ...report.customers.ages.map(item => [item.key, item.count, item.rate ?? "No basis"]),
      [], ["Gender", "Count", "Rate"], ...report.customers.genders.map(item => [item.key, item.count, item.rate ?? "No basis"]),
      [], ["Source", "Orders", "Value"], ...report.sources.map(item => [item.label, item.count, item.valueMinor]),
      [], ["Recorded by", "Orders", "Value"], ...report.recorders.map(item => [item.label, item.count, item.valueMinor]),
      [], ["Order", "Name", "Completed date", "Contact", "Source", "Recorded by", "Currency", "Before tax", "Tax", "Frozen cost"],
      ...report.orders.map(order => [order.number, order.name, order.completedDate, order.contactName, order.source ?? "", order.recorderName ?? "", order.currency, order.valueBeforeTaxMinor, order.taxMinor, order.costMinor ?? "Insufficient cost data"]),
    ];
    const files = {
      "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
      "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
      "xl/worksheets/sheet1.xml": strToU8(worksheet(rows)),
    };
    const archive = zipSync(files, { level: 6 });
    const body = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
    return new Response(body, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="crm-report-${report.input.from}-${report.input.to}.xlsx"`, "x-content-type-options": "nosniff" } });
  }
}
