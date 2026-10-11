import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedChild,discardOutput,finished,stopChild} from '../scripts/live/processes.js';

test('live validation drains both output pipes so a larger test suite cannot block reload',async()=>{
  const child=ownedChild(process.execPath,['-e',"process.stdout.write('x'.repeat(1024*1024));process.stderr.write('y'.repeat(1024*1024));"],process.cwd(),process.env);
  discardOutput(child);let timer:ReturnType<typeof setTimeout>|undefined;
  try{const code=await Promise.race([finished(child),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Child output remained blocked')),5000);})]);assert.equal(code,0);}
  finally{if(timer)clearTimeout(timer);await stopChild(child);}
});
