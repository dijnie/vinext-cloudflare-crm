import type { AppLocale } from "./config";
const en = {
  title: "Modules", description: "Control which modules can change records. Disabling a module preserves its records, relationships and history for reading.",
  enabled: "Enabled", disabled: "Read only", readOnly: "This module is disabled. Existing records and history remain available to read.",
  activityReadOnly: "Activity changes are unavailable because a linked record belongs to a disabled module.",
  saved: "Module settings saved.", conflict: "Module settings changed. Reload before saving again.", reload: "Reload module settings", error: "Unable to load or save module settings.", ownerOnly: "Only the workspace owner can change module settings.",
  entities: { company: "Companies", contact: "Contacts", deal: "Deals", lead: "Leads", product: "Catalog", order: "Orders", contract: "Contracts", review: "Reviews" },
};
export type ModuleDictionary = typeof en;
const vi: ModuleDictionary = {
  title: "Mô-đun", description: "Chọn mô-đun được phép thay đổi bản ghi. Tắt mô-đun vẫn giữ bản ghi, liên kết và lịch sử để xem.",
  enabled: "Đang bật", disabled: "Chỉ đọc", readOnly: "Mô-đun này đang tắt. Bạn vẫn có thể xem các bản ghi và lịch sử đã có.",
  activityReadOnly: "Không thể thay đổi hoạt động vì một bản ghi liên kết thuộc mô-đun đang tắt.",
  saved: "Đã lưu thiết lập mô-đun.", conflict: "Thiết lập mô-đun đã thay đổi. Hãy tải lại trước khi lưu.", reload: "Tải lại thiết lập mô-đun", error: "Không thể tải hoặc lưu thiết lập mô-đun.", ownerOnly: "Chỉ chủ không gian làm việc được thay đổi thiết lập mô-đun.",
  entities: { company: "Công ty", contact: "Liên hệ", deal: "Cơ hội", lead: "Tiềm năng", product: "Danh mục", order: "Đơn hàng", contract: "Hợp đồng", review: "Đánh giá" },
};
export function getModuleDictionary(locale: AppLocale): ModuleDictionary { return locale === "vi" ? vi : en; }
