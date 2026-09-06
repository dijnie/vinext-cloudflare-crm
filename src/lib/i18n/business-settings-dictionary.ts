import type { AppLocale } from "./config";

const en = {
  title: "General settings", description: "Set the business calendar used by new workflows.",
  calendar: "Business calendar", timeZone: "Time zone", timeZoneHelp: "Enter a recognized time zone, for example Asia/Ho_Chi_Minh or UTC.",
  country: "Country code", countryHelp: "Use a two-letter country code, for example VN or US.",
  today: "Current business date", dateHelp: "This date is calculated by the server using the saved time zone.",
  policy: "Record creation times remain unchanged. Business calendar dates are managed separately for new workflows. Existing opportunity dashboard reporting periods continue to use UTC for now.",
  ownerOnly: "All active members can view these settings. Only owners can change them.",
  save: "Save settings", reload: "Reload settings", saving: "Saving…", loading: "Loading…", saved: "Settings saved.", reloaded: "Latest settings loaded.",
  errors: {
    validation_failed: "Enter a valid time zone and a two-letter country code.", conflict: "Another owner changed these settings. Reload the latest settings before saving again.",
    authentication_required: "Your session has expired. Sign in again.", membership_required: "Your membership is no longer active. Sign in again.",
    owner_required: "Only an active owner can change these settings.", permission_required: "Your access has changed. Reload the settings.", internal_error: "Unable to load or save settings. Please try again.",
  },
};
const vi: typeof en = {
  title: "Cài đặt chung", description: "Thiết lập lịch doanh nghiệp dùng cho các quy trình mới.",
  calendar: "Lịch doanh nghiệp", timeZone: "Múi giờ", timeZoneHelp: "Nhập múi giờ hợp lệ, ví dụ Asia/Ho_Chi_Minh hoặc UTC.",
  country: "Mã quốc gia", countryHelp: "Dùng mã quốc gia hai chữ cái, ví dụ VN hoặc US.",
  today: "Ngày hiện tại của doanh nghiệp", dateHelp: "Ngày này do máy chủ tính theo múi giờ đã lưu.",
  policy: "Thời điểm tạo bản ghi không thay đổi. Ngày theo lịch doanh nghiệp được quản lý riêng cho các quy trình mới. Các kỳ báo cáo trên bảng tổng quan cơ hội hiện vẫn sử dụng UTC.",
  ownerOnly: "Mọi thành viên đang hoạt động đều có thể xem thiết lập này. Chỉ chủ sở hữu được thay đổi.",
  save: "Lưu thiết lập", reload: "Tải lại thiết lập", saving: "Đang lưu…", loading: "Đang tải…", saved: "Đã lưu thiết lập.", reloaded: "Đã tải thiết lập mới nhất.",
  errors: {
    validation_failed: "Nhập múi giờ hợp lệ và mã quốc gia hai chữ cái.", conflict: "Chủ sở hữu khác đã thay đổi thiết lập. Hãy tải lại thiết lập mới nhất trước khi lưu tiếp.",
    authentication_required: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", membership_required: "Quyền thành viên không còn hiệu lực. Hãy đăng nhập lại.",
    owner_required: "Chỉ chủ sở hữu đang hoạt động mới được thay đổi thiết lập này.", permission_required: "Quyền truy cập đã thay đổi. Hãy tải lại thiết lập.", internal_error: "Không thể tải hoặc lưu thiết lập. Vui lòng thử lại.",
  },
};
export function getBusinessSettingsDictionary(locale: AppLocale) { return locale === "vi" ? vi : en; }
