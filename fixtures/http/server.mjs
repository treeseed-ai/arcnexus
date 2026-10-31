import {createServer} from 'node:http';
const server=createServer((req,res)=>{res.setHeader('content-type','application/json');res.statusCode=req.url==='/health'?200:404;res.end(JSON.stringify({status:req.url==='/health'?'ready':'missing'}));});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(Number(process.env.ARCNEXUS_PORT??0),process.env.ARCNEXUS_HOST??'127.0.0.1',()=>{console.log(JSON.stringify({arcnexusEndpoint:{host:'127.0.0.1',port:server.address().port}}));});
process.on('SIGTERM',()=>server.close());
