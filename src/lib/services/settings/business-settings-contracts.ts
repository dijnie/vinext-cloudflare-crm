import { z } from "zod";
import { isCountryCode } from "./country-codes";
import { isTimeZone } from "./business-time";

export const businessSettingsInputSchema = z.object({
  timeZone: z.string().trim().min(1).max(100).refine(isTimeZone),
  countryCode: z.string().trim().toUpperCase().refine(isCountryCode),
  revision: z.number().int().nonnegative(),
}).strict();
export type BusinessSettingsInput = z.infer<typeof businessSettingsInputSchema>;
export interface BusinessSettings {
  timeZone: string;
  countryCode: string;
  revision: number;
  canManage: boolean;
  today: string;
  dayStartsAt: string;
  dayEndsAt: string;
}
