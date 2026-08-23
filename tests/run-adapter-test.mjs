
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const mime={".json":"application/json",".js":"text/javascript"};
const server=createServer(async(req,res)=>{
  try {
    const path=normalize(join(root,req.url));
    if(!path.startsWith(root)) throw new Error("bad path");
    const body=await readFile(path);
    res.writeHead(200,{"Content-Type":mime[extname(path)]||"application/octet-stream"});
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
server.listen(0,"127.0.0.1",()=>console.log(server.address().port));
