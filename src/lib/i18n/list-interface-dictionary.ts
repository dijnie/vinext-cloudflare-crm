import type { AppLocale } from "./config";
const dictionaries = {
  vi: { description: { product: "Sản phẩm, dịch vụ và gói.", lead: "Tiềm năng và lịch sử chuyển đổi thành liên hệ.", company: "Tất cả công ty trong quy trình bán hàng.", contact: "Mọi liên hệ trong quy trình bán hàng.", deal: "Các cơ hội đang theo đuổi và đã kết thúc.", order: "Đơn hàng, trạng thái xử lý và công nợ." }, openDeals: "cơ hội đang mở" },
  en: { description: { product: "Products, services and packages.", lead: "Leads and their contact conversion history.", company: "Every account in the pipeline.", contact: "Everyone in the pipeline.", deal: "The pipeline, and everything that has already closed.", order: "Orders, fulfillment state and balances." }, openDeals: "open deals" },
};
export function getListInterfaceDictionary(locale: AppLocale) { return dictionaries[locale]; }
