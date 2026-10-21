import {products} from "../../../data";
export function GET(request:Request) {
 const p=new URL(request.url).searchParams;
 if(!["/urunler","/products"].includes(p.get("path")??"")) return Response.json({error:"invalid_catalog_request"},{status:400});
 const offset=Number(p.get("offset")??0),query=(p.get("q")??"").toLocaleLowerCase("tr");
 const list=products.filter(product=>product.title.toLocaleLowerCase("tr").includes(query));
 return Response.json({items:list.slice(offset,offset+24),total:list.length,nextOffset:offset+24<list.length?offset+24:null});
}
