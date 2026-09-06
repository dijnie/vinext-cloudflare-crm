import type { AppLocale } from "./config";

const en = {
  welcome: "Welcome back", mineSummary: "What you have closed, what is still in play, and what needs you today.", teamSummary: "What the team has closed, what is still in play, and what needs you today.", me: "Me", joined: "Joined", you: "You", showing: "Showing", of: "of",
  account: "Account menu", light: "Light mode", dark: "Dark mode", home: "Homepage",
  tagline: "Every customer, one place.", settings: "Settings", workspace: "Workspace",
  salesDescription: "Your pipeline, your priorities, and what happened today.",
  trendTitle: "Closed won vs. new pipeline", trendDescription: "Last six months, by the month a deal closed or was created",
  pipelineTitle: "Open pipeline by stage", pipelineDescription: "Where the value sits right now",
  previousMonth: "vs. last month", inProgress: "in progress", dueThisMonth: "due this month",
  noClosed: "Nothing has closed yet", noWins: "No wins to measure", averageCycle: "average cycle",
  allDeals: "View deals", overdue: "Overdue", activity: "Activity", when: "When", who: "Who",
  amount: "Value", stage: "Stage", task: "Task", complete: "Complete task", chartData: "View chart data",
  rates: "Exchange rates", ratesDescription: "Manage the rates used to report deal values in one currency.",
  reportingDescription: "Every total, chart and average uses the reporting currency. Each deal keeps its original currency.",
  source: "Source", rateDate: "As of",
};
const vi: typeof en = {
  welcome: "Chào mừng trở lại", mineSummary: "Kết quả đã chốt, cơ hội đang mở và những việc bạn cần làm hôm nay.", teamSummary: "Kết quả cả nhóm đã chốt, cơ hội đang mở và những việc cần làm hôm nay.", me: "Tôi", joined: "Tham gia", you: "Bạn", showing: "Hiển thị", of: "trên",
  account: "Menu tài khoản", light: "Giao diện sáng", dark: "Giao diện tối", home: "Trang chủ",
  tagline: "Mọi khách hàng, cùng một nơi.", settings: "Cài đặt", workspace: "Không gian làm việc",
  salesDescription: "Cơ hội bán hàng, công việc ưu tiên và hoạt động hôm nay.",
  trendTitle: "Thành công và cơ hội mới", trendDescription: "Sáu tháng qua, theo tháng chốt hoặc tạo cơ hội",
  pipelineTitle: "Cơ hội đang mở theo giai đoạn", pipelineDescription: "Giá trị cơ hội ở từng giai đoạn hiện tại",
  previousMonth: "so với tháng trước", inProgress: "đang xử lý", dueThisMonth: "dự kiến chốt tháng này",
  noClosed: "Chưa có cơ hội đã chốt", noWins: "Chưa có cơ hội thành công", averageCycle: "chu kỳ trung bình",
  allDeals: "Xem cơ hội", overdue: "Quá hạn", activity: "Hoạt động", when: "Thời gian", who: "Người thực hiện",
  amount: "Giá trị", stage: "Giai đoạn", task: "Công việc", complete: "Hoàn thành công việc", chartData: "Xem dữ liệu biểu đồ",
  rates: "Tỷ giá quy đổi", ratesDescription: "Quản lý tỷ giá dùng để báo cáo giá trị cơ hội theo cùng một tiền tệ.",
  reportingDescription: "Tổng tiền, biểu đồ và giá trị trung bình dùng tiền tệ báo cáo. Mỗi cơ hội vẫn giữ tiền tệ gốc.",
  source: "Nguồn", rateDate: "Ngày áp dụng",
};
export function getShellInterfaceDictionary(locale: AppLocale) { return locale === "vi" ? vi : en; }
