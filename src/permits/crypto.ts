import{createCipheriv,createDecipheriv,randomBytes}from'node:crypto';
/** Signatures remain local, encrypted at rest and bound to one immutable acceptance record. */
export function encryptPermit(signature:string,key:string,aad:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(Buffer.from(aad));
  const data=Buffer.concat([cipher.update(signature,'utf8'),cipher.final()]);return JSON.stringify({iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('hex')});
}
export function decryptPermit(value:string,key:string,aad:string){
  const e=JSON.parse(value),cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(e.iv,'hex'));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(Buffer.from(e.tag,'hex'));return Buffer.concat([cipher.update(Buffer.from(e.data,'hex')),cipher.final()]).toString('utf8');
}
