import type { AppLocale } from "./config";
import type { Permission } from "@/lib/services/permissions/access-contracts";

const en = {
  title: "Branches and permissions", shared: "Active members can read shared CRM records across all branches. Branch assignments organize the team; they do not restrict record visibility.",
  branches: "Branches", branchHelp: "Maintain branches and choose the default for future use. Existing records are not automatically assigned.",
  profiles: "Permission profiles", profileHelp: "Profiles control actions members can perform. The standard profile preserves existing permissions and cannot be changed or deleted.",
  members: "Member assignments", memberHelp: "Assign a profile and any number of branches, with one primary branch. Revoked members cannot be reassigned.",
  ownerHelp: "Owners retain administrative access independently of their permission profile.", exportHelp: "Export grants are reserved for future export support. No export action is available here.",
  createBranch: "Create branch", renameBranch: "Rename branch", createProfile: "Create profile", editProfile: "Edit profile", assignProfile: "Assign profile", assignBranches: "Assign branches",
  name: "Name", save: "Save", cancel: "Cancel", close: "Close", edit: "Edit", remove: "Delete", archive: "Archive", restore: "Restore", setDefault: "Set as default", default: "Default", archived: "Archived", standard: "Standard member", primary: "Primary branch", noBranches: "No branches assigned", noGrants: "Read shared records only", grants: "Allowed actions", profile: "Permission profile", owner: "Owner", member: "Member", revoked: "Revoked", active: "Active",
  saved: "Changes saved.", saving: "Saving…", empty: "No entries yet.", confirm: "Confirm change", deleteHelp: "An assigned profile cannot be deleted. Assign another profile to its members first.", archiveHelp: "The default branch cannot be archived. Active member assignments must be removed first.",
  errors: {
    internal_error: "Unable to save changes. Please try again.", invalid_input: "Check the name and selected assignments.", validation_failed: "Check the name and selected assignments.",
    owner_required: "Only an active owner can manage these settings.", membership_required: "Your membership is no longer active. Sign in again.", permission_required: "Your permissions have changed. Reload the page.",
    not_found: "This item is no longer available. Reload the page.", conflict: "This item is protected, still assigned, or its name is already in use. Check assignments and reload before trying again.",
    authentication_required: "Your session has expired. Sign in again.",
  },
};
const vi: typeof en = {
  title: "Chi nhánh và quyền", shared: "Thành viên đang hoạt động có thể đọc dữ liệu CRM dùng chung ở mọi chi nhánh. Việc gán chi nhánh dùng để tổ chức đội ngũ, không giới hạn quyền xem dữ liệu.",
  branches: "Chi nhánh", branchHelp: "Quản lý chi nhánh và chọn chi nhánh mặc định cho việc sử dụng sau này. Dữ liệu hiện có không được tự động gán chi nhánh.",
  profiles: "Hồ sơ quyền", profileHelp: "Hồ sơ quyền quy định thao tác thành viên được thực hiện. Hồ sơ tiêu chuẩn giữ các quyền hiện có và không thể sửa hoặc xóa.",
  members: "Phân quyền thành viên", memberHelp: "Gán hồ sơ quyền và nhiều chi nhánh, trong đó có một chi nhánh chính. Không thể thay đổi phân công của thành viên đã thu hồi quyền truy cập.",
  ownerHelp: "Chủ sở hữu giữ quyền quản trị độc lập với hồ sơ quyền được gán.", exportHelp: "Quyền xuất dữ liệu được dành cho tính năng xuất dữ liệu sau này. Trang này chưa có thao tác xuất dữ liệu.",
  createBranch: "Tạo chi nhánh", renameBranch: "Đổi tên chi nhánh", createProfile: "Tạo hồ sơ quyền", editProfile: "Sửa hồ sơ quyền", assignProfile: "Gán hồ sơ quyền", assignBranches: "Gán chi nhánh",
  name: "Tên", save: "Lưu", cancel: "Hủy", close: "Đóng", edit: "Sửa", remove: "Xóa", archive: "Lưu trữ", restore: "Khôi phục", setDefault: "Đặt làm mặc định", default: "Mặc định", archived: "Đã lưu trữ", standard: "Thành viên tiêu chuẩn", primary: "Chi nhánh chính", noBranches: "Chưa gán chi nhánh", noGrants: "Chỉ đọc dữ liệu dùng chung", grants: "Thao tác được phép", profile: "Hồ sơ quyền", owner: "Chủ sở hữu", member: "Thành viên", revoked: "Đã thu hồi", active: "Đang hoạt động",
  saved: "Đã lưu thay đổi.", saving: "Đang lưu…", empty: "Chưa có dữ liệu.", confirm: "Xác nhận thay đổi", deleteHelp: "Không thể xóa hồ sơ đang được gán. Hãy gán hồ sơ khác cho các thành viên trước.", archiveHelp: "Không thể lưu trữ chi nhánh mặc định. Cần bỏ phân công của thành viên đang hoạt động trước.",
  errors: {
    internal_error: "Không thể lưu thay đổi. Vui lòng thử lại.", invalid_input: "Kiểm tra tên và các lựa chọn phân công.", validation_failed: "Kiểm tra tên và các lựa chọn phân công.",
    owner_required: "Chỉ chủ sở hữu đang hoạt động mới được quản lý các thiết lập này.", membership_required: "Quyền thành viên không còn hiệu lực. Hãy đăng nhập lại.", permission_required: "Quyền của bạn đã thay đổi. Hãy tải lại trang.",
    not_found: "Mục này không còn tồn tại. Hãy tải lại trang.", conflict: "Mục này được bảo vệ, vẫn đang được gán hoặc trùng tên. Kiểm tra phân công và tải lại trước khi thử lại.", authentication_required: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  },
};
const permissions: Record<AppLocale, Record<Permission, string>> = {
  en: {
    "product.create": "Create catalog records", "product.update": "Edit catalog records", "product.archive": "Archive catalog records", "product.restore": "Restore catalog records", "product.assign": "Assign catalog records", "product.export": "Export catalog records",
    "lead.create": "Create leads", "lead.update": "Edit leads", "lead.archive": "Archive leads", "lead.restore": "Restore leads", "lead.assign": "Assign leads", "lead.export": "Export leads", "lead.convert": "Convert leads",
    "company.create": "Create companies", "company.update": "Edit companies", "company.archive": "Archive companies", "company.restore": "Restore companies", "company.assign": "Assign companies", "company.export": "Export companies",
    "contact.create": "Create contacts", "contact.update": "Edit contacts", "contact.archive": "Archive contacts", "contact.restore": "Restore contacts", "contact.assign": "Assign contacts", "contact.export": "Export contacts",
    "deal.create": "Create deals", "deal.update": "Edit deals", "deal.archive": "Archive deals", "deal.restore": "Restore deals", "deal.assign": "Assign deals", "deal.export": "Export deals",
    "activity.create": "Create activities", "activity.update": "Edit activities", "field.configure": "Configure custom fields", "view.create": "Create saved views", "view.update": "Edit saved views", "view.delete": "Delete saved views",
  },
  vi: {
    "product.create": "Tạo danh mục", "product.update": "Sửa danh mục", "product.archive": "Lưu trữ danh mục", "product.restore": "Khôi phục danh mục", "product.assign": "Phân công danh mục", "product.export": "Xuất danh mục",
    "lead.create": "Tạo tiềm năng", "lead.update": "Sửa tiềm năng", "lead.archive": "Lưu trữ tiềm năng", "lead.restore": "Khôi phục tiềm năng", "lead.assign": "Phân công tiềm năng", "lead.export": "Xuất tiềm năng", "lead.convert": "Chuyển đổi tiềm năng",
    "company.create": "Tạo công ty", "company.update": "Sửa công ty", "company.archive": "Lưu trữ công ty", "company.restore": "Khôi phục công ty", "company.assign": "Phân công công ty", "company.export": "Xuất công ty",
    "contact.create": "Tạo liên hệ", "contact.update": "Sửa liên hệ", "contact.archive": "Lưu trữ liên hệ", "contact.restore": "Khôi phục liên hệ", "contact.assign": "Phân công liên hệ", "contact.export": "Xuất liên hệ",
    "deal.create": "Tạo cơ hội", "deal.update": "Sửa cơ hội", "deal.archive": "Lưu trữ cơ hội", "deal.restore": "Khôi phục cơ hội", "deal.assign": "Phân công cơ hội", "deal.export": "Xuất cơ hội",
    "activity.create": "Tạo hoạt động", "activity.update": "Sửa hoạt động", "field.configure": "Cấu hình trường tùy chỉnh", "view.create": "Tạo chế độ xem", "view.update": "Sửa chế độ xem", "view.delete": "Xóa chế độ xem",
  },
};
export function getAccessDictionary(locale: AppLocale) { return { ...(locale === "vi" ? vi : en), permissions: permissions[locale] }; }
export type AccessDictionary = ReturnType<typeof getAccessDictionary>;
