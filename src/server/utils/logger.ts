export function log(action: string, fields: Record<string, unknown> = {}) { console.info(JSON.stringify({ timestamp: new Date().toISOString(), action, ...fields })); }
