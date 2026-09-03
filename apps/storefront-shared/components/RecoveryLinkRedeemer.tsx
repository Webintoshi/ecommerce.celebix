"use client";

import { useEffect, useState } from "react";

export function RecoveryLinkRedeemer() {
  const [message,setMessage]=useState("Güvenli sepet bağlantısı doğrulanıyor…");
  useEffect(()=>{
    const match=/^#token=([A-Za-z0-9_-]{43})$/.exec(window.location.hash),token=match?.[1];
    history.replaceState(null,"","/cart/recover");
    if(!token){setMessage("Bu sepet bağlantısı geçersiz.");return;}
    void fetch("/api/cart/recover",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({token}),referrerPolicy:"no-referrer"})
      .then(async(response)=>{const body=await response.json() as {location?:unknown};if(!response.ok||typeof body.location!=="string"||!/^\/cart\?recovered=1&omitted=\d{1,3}&adjusted=\d{1,3}$/.test(body.location))throw Error();window.location.replace(body.location)})
      .catch(()=>setMessage("Sepet bağlantısı kullanılamıyor veya süresi dolmuş."));
  },[]);
  return <p role="status">{message}</p>;
}
