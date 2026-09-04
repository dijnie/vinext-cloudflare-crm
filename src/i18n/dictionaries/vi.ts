import type { AppDictionary } from "../dictionary";

export const vi = {
  locale: "vi",
  common: { appName: "CRM", email: "Email", password: "Mật khẩu", name: "Họ và tên", cancel: "Hủy", close: "Đóng", loading: "Đang xử lý…", language: "Ngôn ngữ" },
  auth: {
    signInTitle: "Đăng nhập", signInDescription: "Đăng nhập bằng tài khoản email đã xác minh.", signIn: "Đăng nhập",
    signUpTitle: "Tạo tài khoản", signUpDescription: "Bắt đầu sử dụng không gian CRM chung.", signUp: "Đăng ký",
    forgotPassword: "Quên mật khẩu?", forgotTitle: "Khôi phục mật khẩu", forgotDescription: "Nhập email để nhận liên kết đặt lại mật khẩu.",
    sendResetLink: "Gửi liên kết", resetSent: "Nếu email hợp lệ, liên kết khôi phục đã được gửi.",
    resetTitle: "Đặt lại mật khẩu", resetDescription: "Chọn mật khẩu mới cho tài khoản của bạn.", newPassword: "Mật khẩu mới",
    resetPassword: "Đổi mật khẩu", resetSuccess: "Mật khẩu đã được đổi. Bạn có thể đăng nhập.", verifyTitle: "Kiểm tra email",
    verifyDescription: "Mở liên kết xác minh đã gửi đến email của bạn trước khi đăng nhập.", resendVerification: "Gửi lại email xác minh",
    verificationSent: "Email xác minh đã được gửi lại.", haveAccount: "Đã có tài khoản?", needAccount: "Chưa có tài khoản?",
    genericError: "Không thể tiếp tục. Hãy kiểm tra thông tin và thử lại.", invalidResetLink: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", signOut: "Đăng xuất", signOutError: "Không thể đăng xuất. Hãy thử lại.",
  },
  navigation: { companies: "Công ty", members: "Thành viên", settings: "Cài đặt", openMenu: "Mở menu", closeMenu: "Đóng menu" },
  companies: { title: "Công ty", empty: "Chưa có công ty", open: "Mở chi tiết", close: "Đóng" },
  members: {
    title: "Thành viên", description: "Quản lý quyền truy cập không gian CRM chung.", member: "Thành viên", role: "Vai trò", status: "Trạng thái",
    actions: "Thao tác", owner: "Chủ sở hữu", active: "Đang hoạt động", revoked: "Đã thu hồi", makeOwner: "Đặt làm chủ sở hữu",
    makeMember: "Đặt làm thành viên", restore: "Khôi phục", remove: "Thu hồi quyền", removeTitle: "Thu hồi quyền thành viên",
    removeDescription: "Các bản ghi đang thuộc thành viên này cần được chuyển giao hoặc bỏ gán.", replacement: "Chuyển bản ghi cho",
    noReplacement: "Không gán cho ai", lastOwner: "Không thể loại bỏ chủ sở hữu cuối cùng. Hãy bổ nhiệm chủ sở hữu khác trước.",
    saved: "Đã cập nhật thành viên.", genericError: "Không thể cập nhật thành viên.",
  },
} satisfies AppDictionary;
