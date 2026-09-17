export function alertLog(event: string, fields: {
  alert_id?: string; trigger_id?: string; delivery_id?: string; reason?: string;
  code?: string; groups?: number; alerts?: number; triggered?: number;
} = {}): void {
  // Only non-secret operational IDs, categories and counts. Never serialize caught errors.
  console.info(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}
