import type {DatabaseSync} from 'node:sqlite';
import {AppError} from '../utils/errors.js';
export const authorizationSchemaReady=(db:DatabaseSync)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='trade_authorizations'").get();
/** Both existing financial entry points use this policy inside their write transaction. */
export function assertFinancialAvailable(db:DatabaseSync,user:string,wallet:string,excludeTrade='',excludePermit=''){
  if(db.prepare('SELECT 1 FROM wallet_quarantine WHERE lower(address)=lower(?)').get(wallet))throw new AppError('WALLET_BUSY');
  if(db.prepare(`SELECT 1 FROM permit_acceptance p WHERE (p.user_id=? OR lower(p.wallet)=lower(?)) AND p.id!=? AND p.closed_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM permit_retirements r WHERE r.permit_id=p.id AND r.version=p.version)`).get(user,wallet,excludePermit))throw new AppError('PERMIT_LOCKED');
  const signatures=authorizationSchemaReady(db)?" OR EXISTS(SELECT 1 FROM trade_authorizations a WHERE a.trade_id=t.id)":"";
  if(db.prepare(`SELECT 1 FROM trade_sessions t WHERE (t.user_id=? OR lower(t.wallet)=lower(?)) AND t.id!=? AND
    (t.state NOT IN ('CONFIRMED','FAILED','CANCELLED','EXPIRED') OR (t.state!='CONFIRMED' AND (t.submitted_at IS NOT NULL ${signatures})))`).get(user,wallet,excludeTrade))throw new AppError('WALLET_BUSY');
  if(db.prepare("SELECT 1 FROM funding_claims WHERE (user_id=? OR lower(wallet)=lower(?)) AND attempted=1 AND state!='CLAIM_BALANCES_VERIFIED'").get(user,wallet))throw new AppError('WALLET_BUSY');
}
