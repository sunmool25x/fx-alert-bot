// Local subprocess fixture only. Never imported by the application or launcher.
import { createServer } from 'node:http';
const server=createServer((_request,response)=>response.end('fixture'));
server.listen(0,'127.0.0.1',()=>process.send?.({type:'ready',port:server.address().port}));
process.on('message',message=>{
  if(message?.type==='dev:shutdown')server.close(()=>{process.send?.({type:'drained'});if(process.connected)process.disconnect();});
});
process.once('disconnect',()=>server.close());
