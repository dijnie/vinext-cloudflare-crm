import {expect,test,type APIResponse} from "@playwright/test";
import {Temporal} from "@js-temporal/polyfill";
import {getSchedulingDictionary} from "../../src/lib/i18n/scheduling-dictionary";
import {resolveLocalDateTime} from "../../src/lib/services/custom-fields/field-datetime";

test.setTimeout(120_000);
async function checked(response:Pick<APIResponse,"ok"|"text"|"json">){expect(response.ok(),await response.text()).toBe(true);return response.json();}
test.beforeEach(async({page,baseURL})=>{await checked(await page.request.post("/api/auth/sign-in/email",{headers:{origin:baseURL!},data:{email:process.env["E2E_OWNER_EMAIL"],password:process.env["E2E_OWNER_PASSWORD"]}}));});

test("Vietnamese personal tasks, conflict-aware calendar and ticket cycles",async({page,baseURL})=>{
 const copy=getSchedulingDictionary("vi"),headers={origin:baseURL!};await page.goto("/vi/crm/tasks");await expect(page.getByText(copy.noItems,{exact:true})).toBeVisible();const name=`schedule-${Date.now()}`,company=await checked(await page.request.post("/api/crm/companies",{headers,data:{name}})),task=await checked(await page.request.post("/api/crm/tasks",{headers,data:{subject:"Gọi lại khách hàng",companyId:company.id,dueAt:new Date(Date.now()+3600000).toISOString()}}));
 await page.reload();const taskRow=page.locator("li").filter({hasText:"Gọi lại khách hàng"});await expect(taskRow).toBeVisible();await taskRow.getByRole("button",{name:copy.complete,exact:true}).click();await expect(taskRow).toContainText(copy.completed);page.once("dialog",dialog=>dialog.accept("Khách vừa phản hồi"));await taskRow.getByRole("button",{name:copy.reopen,exact:true}).click();await expect(taskRow).toContainText(copy.open);
 await page.goto("/vi/crm/calendar");await expect(page.locator('[data-calendar-view="week"]')).toBeVisible();await page.getByRole("button",{name:copy.month,exact:true}).click();await expect(page.locator('[data-calendar-view="month"]')).toBeVisible();await page.getByRole("button",{name:copy.week,exact:true}).click();async function fill(subject:string){await page.getByRole("button",{name:copy.newAppointment,exact:true}).click();await page.getByLabel(copy.subject,{exact:true}).fill(subject);await page.getByRole("button",{name:copy.create,exact:true}).click();}await fill("Tư vấn lần đầu");await expect(page.getByText("Tư vấn lần đầu",{exact:true})).toBeVisible();await fill("Tư vấn trùng giờ");await expect(page.getByRole("alert")).toContainText(copy.conflict);await page.getByRole("button",{name:copy.allowConflict,exact:true}).click();await expect(page.getByText("Tư vấn trùng giờ",{exact:true})).toBeVisible();
 await page.goto("/vi/crm/tickets");await page.getByLabel(copy.subject,{exact:true}).fill("Cần hỗ trợ đơn hàng");await page.getByRole("button",{name:copy.create,exact:true}).click();const ticket=page.locator("li").filter({hasText:"Cần hỗ trợ đơn hàng"});await expect(ticket).toBeVisible();page.once("dialog",dialog=>dialog.accept("Đã liên hệ khách hàng"));await ticket.getByRole("button",{name:copy.respond,exact:true}).click();await expect(ticket).toContainText(copy.response);await ticket.getByRole("button",{name:copy.resolve,exact:true}).click();await expect(ticket).toContainText(copy.resolved);page.once("dialog",dialog=>dialog.accept("Khách cần hỗ trợ thêm"));await ticket.getByRole("button",{name:copy.reopen,exact:true}).click();await expect(ticket).toContainText(copy.open);await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(task.id).toBeTruthy();
});

test("English empty work views and denied browser permission keep in-app reminders",async({page,baseURL})=>{
 const copy=getSchedulingDictionary("en"),headers={origin:baseURL!};await page.addInitScript(()=>{Object.defineProperty(Notification,"permission",{configurable:true,get:()=>"denied"});Notification.requestPermission=async()=>"denied";});await page.goto("/en/crm/tasks");const company=await checked(await page.request.post("/api/crm/companies",{headers,data:{name:`reminder-${Date.now()}`}}));await checked(await page.request.post("/api/crm/tasks",{headers,data:{subject:"Reminder remains in app",companyId:company.id,dueAt:new Date(Date.now()-60000).toISOString()}}));await page.reload();await page.getByRole("button",{name:copy.reminder,exact:true}).click();const reminder=page.getByRole("button",{name:/Reminder remains in app/});await expect(reminder).toBeVisible();await page.getByRole("button",{name:copy.enableBrowser,exact:true}).click();await expect(page.getByRole("alert")).toContainText(copy.permissionDenied);await expect(reminder).toBeVisible();
});

test("after-hours and overnight appointments remain visible",async({page,baseURL})=>{
 const headers={origin:baseURL!},settings=await checked(await page.request.get("/api/crm/settings")) as {today:string;timeZone:string;revision:number};
 const today=Temporal.PlainDate.from(settings.today),weekStart=today.subtract({days:today.dayOfWeek-1}),baseDay=weekStart.add({days:2}),nextDay=baseDay.add({days:1});
 const create=async(subject:string,start:string,end:string)=>checked(await page.request.post("/api/crm/appointments",{headers,data:{operationKey:crypto.randomUUID(),calendarRevision:settings.revision,subject,startsAt:resolveLocalDateTime(start,settings.timeZone)[0]!.instant,endsAt:resolveLocalDateTime(end,settings.timeZone)[0]!.instant,participantMembershipIds:[],reminderEnabled:false,reminderOffsetMinutes:15,acknowledgeConflict:false}}));
 const suffix=crypto.randomUUID().slice(0,8),late=`Late appointment ${suffix}`,overnight=`Overnight appointment ${suffix}`;
 await create(late,`${baseDay}T19:00`,`${baseDay}T20:00`);
 await create(overnight,`${baseDay}T23:30`,`${nextDay}T00:30`);
 await page.goto("/en/crm/calendar");
 const grid=page.locator('[data-calendar-view="week"]');
 await expect(grid.getByText(late,{exact:true})).toBeVisible();
 await expect(grid.getByText(overnight,{exact:true})).toHaveCount(2);
});

test("stale calendar settings refresh the revision before retry",async({page,baseURL})=>{
 const copy=getSchedulingDictionary("en"),headers={origin:baseURL!},settings=await checked(await page.request.get("/api/crm/settings")) as {today:string;timeZone:string;countryCode:string;revision:number},targetTimeZone=settings.timeZone==="UTC"?"Asia/Ho_Chi_Minh":"UTC";
 try{
  await page.goto("/en/crm/calendar");
  const changed=await checked(await page.request.patch("/api/crm/settings",{headers,data:{timeZone:targetTimeZone,countryCode:settings.countryCode,revision:settings.revision}})) as {today:string;revision:number};
  const subject=`Stale retry ${crypto.randomUUID().slice(0,8)}`;
  await page.getByRole("button",{name:copy.newAppointment,exact:true}).click();
  await page.getByLabel(copy.subject,{exact:true}).fill(subject);
  await page.getByLabel(copy.startsAt,{exact:true}).fill(`${changed.today}T03:00`);
  await page.getByLabel(copy.endsAt,{exact:true}).fill(`${changed.today}T03:30`);
  await page.getByRole("button",{name:copy.create,exact:true}).click();
  await expect(page.getByRole("alert")).toHaveText(copy.calendarStale);
  await expect(page.getByRole("button",{name:copy.allowConflict,exact:true})).toHaveCount(0);
  const retried=page.waitForRequest(request=>request.url().endsWith("/api/crm/appointments")&&request.method()==="POST");
  await page.getByRole("button",{name:copy.create,exact:true}).click();
  const payload=(await retried).postDataJSON();
  expect(payload.calendarRevision).toBe(changed.revision);
  expect(payload.startsAt).toBe(resolveLocalDateTime(`${changed.today}T03:00`,targetTimeZone)[0]!.instant);
  await expect(page.getByRole("dialog")).toHaveCount(0);
 }finally{
  const latest=await checked(await page.request.get("/api/crm/settings")) as {revision:number};
  await checked(await page.request.patch("/api/crm/settings",{headers,data:{timeZone:settings.timeZone,countryCode:settings.countryCode,revision:latest.revision}}));
 }
});

test("appointment creation reuses its operation key after a lost response",async({page,baseURL})=>{
 const copy=getSchedulingDictionary("en"),headers={origin:baseURL!},settings=await checked(await page.request.get("/api/crm/settings")) as {today:string;timeZone:string;revision:number},subject=`Lost response ${crypto.randomUUID().slice(0,8)}`;
 let committedKey:string|undefined,retriedKey:string|undefined;
 await page.route("**/api/crm/appointments",async route=>{
  if(route.request().method()!=="POST")return route.continue();
  const payload=route.request().postDataJSON();
  if(payload.subject!==subject)return route.continue();
  if(!committedKey){committedKey=payload.operationKey;const response=await route.fetch();expect(response.ok()).toBe(true);return route.abort("failed");}
  retriedKey=payload.operationKey;return route.continue();
 });
 await page.goto("/en/crm/calendar");
 await page.getByRole("button",{name:copy.newAppointment,exact:true}).click();
 await page.getByLabel(copy.subject,{exact:true}).fill(subject);
 await page.getByLabel(copy.startsAt,{exact:true}).fill(`${settings.today}T05:00`);
 await page.getByLabel(copy.endsAt,{exact:true}).fill(`${settings.today}T05:30`);
 await page.getByRole("button",{name:copy.create,exact:true}).click();
 await expect(page.getByRole("alert")).toHaveText(copy.errors);
 await page.getByRole("button",{name:copy.create,exact:true}).click();
 await expect(page.getByText(subject,{exact:true})).toBeVisible();
 expect(retriedKey).toBe(committedKey);
});
