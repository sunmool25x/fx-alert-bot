import type { DatabaseSync } from "node:sqlite";
import type { ActionOrigin } from "../nlu/parser.js";
import type { Entry } from "../analytics/types.js";
/** Optional input labels only. Separate from quote/trigger origin and financial state. */
export class InputOrigins {
  constructor(private db:DatabaseSync){
    db.exec(`CREATE TABLE IF NOT EXISTS quote_input_origins (
      id TEXT PRIMARY KEY REFERENCES quote_intents(id) ON DELETE CASCADE,
      input_origin TEXT NOT NULL CHECK(input_origin IN ('command','button','natural_language')));
      CREATE TABLE IF NOT EXISTS alert_input_origins (
      id TEXT PRIMARY KEY REFERENCES alerts(id) ON DELETE CASCADE,
      input_origin TEXT NOT NULL CHECK(input_origin IN ('command','button','natural_language')));`);
  }
  set(kind:"quote"|"alert",id:string,origin:ActionOrigin){
    this.db.prepare(`INSERT INTO ${kind}_input_origins(id,input_origin) VALUES(?,?) ON CONFLICT(id) DO NOTHING`).run(id,origin);
  }
  get(kind:"quote"|"alert",id:string):ActionOrigin|undefined {
    return this.db.prepare(`SELECT input_origin FROM ${kind}_input_origins WHERE id=?`).get(id)?.input_origin as ActionOrigin|undefined;
  }
  alertEntry(id:string,entry:Entry,parent?:string){
    this.db.prepare("UPDATE alert_input_origins SET entry=?,parent_id=? WHERE id=?").run(entry,parent??null,id);
  }
  quoteParent(id:string,parent:string){this.db.prepare("UPDATE quote_input_origins SET parent_id=? WHERE id=?").run(parent,id);}
  parent(id:string){return this.db.prepare("SELECT parent_id FROM quote_input_origins WHERE id=?").get(id)?.parent_id as string|undefined;}
}
