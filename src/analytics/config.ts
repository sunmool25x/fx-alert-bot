import { z } from "zod";
const ids=z.string().regex(/^(\d{1,20}(,\d{1,20})*)?$/).max(2200);
export function analyticsConfig(env:NodeJS.ProcessEnv){
  // Existing beta-owner allowlist is a secure local fallback, never a browser value.
  const admins=ids.parse(env.ANALYTICS_ADMIN_USER_IDS??env.EXECUTION_USER_IDS??"");
  const excluded=ids.parse(env.ANALYTICS_EXCLUDED_USER_IDS??env.EXECUTION_USER_IDS??"");
  return {admins:[...new Set(admins.split(",").filter(Boolean))],excluded:[...new Set(excluded.split(",").filter(Boolean))]};
}
