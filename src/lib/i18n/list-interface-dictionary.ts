import type { AppLocale } from "./config";
const dictionaries = {
  vi: { description: { company: "Tất cả công ty trong quy trình bán hàng.", contact: "Mọi liên hệ trong quy trình bán hàng.", deal: "Các cơ hội đang theo đuổi và đã kết thúc." }, openDeals: "cơ hội đang mở" },
  en: { description: { company: "Every account in the pipeline.", contact: "Everyone in the pipeline.", deal: "The pipeline, and everything that has already closed." }, openDeals: "open deals" },
};
export function getListInterfaceDictionary(locale: AppLocale) { return dictionaries[locale]; }
