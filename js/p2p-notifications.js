(function(){
  if(window.__p2pBrandNotificationsLoaded)return;
  window.__p2pBrandNotificationsLoaded=true;
  const style=document.createElement("style");
  style.textContent=`
    #p2p-brand-toast-host{position:fixed;top:max(18px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:2147483647;width:min( calc(100% - 32px),420px);pointer-events:none;display:grid;gap:10px;font-family:inherit}
    .p2p-brand-toast{pointer-events:auto;display:flex;align-items:center;gap:12px;padding:14px 15px;background:#fff;color:#172321;border:1px solid rgba(8,127,115,.18);border-left:4px solid #087f73;border-radius:16px;box-shadow:0 12px 36px rgba(0,0,0,.18);animation:p2pToastIn .22s ease-out}
    .p2p-brand-toast-icon{width:34px;height:34px;flex:0 0 34px;border-radius:50%;display:grid;place-items:center;background:#e6f5f2;color:#087f73;font-size:19px;font-weight:800}
    .p2p-brand-toast-copy{min-width:0;flex:1}.p2p-brand-toast-title{font-size:13px;font-weight:750;color:#087f73;margin-bottom:2px}.p2p-brand-toast-message{font-size:14px;line-height:1.4;overflow-wrap:anywhere}
    .p2p-brand-toast-close{border:0;background:transparent;color:#64716f;font-size:20px;padding:2px 5px;cursor:pointer}
    @keyframes p2pToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @media(prefers-color-scheme:dark){.p2p-brand-toast{background:#202725;color:#f3f7f6;border-color:rgba(16,168,137,.3)}.p2p-brand-toast-icon{background:#123d36;color:#63d5bd}.p2p-brand-toast-title{color:#63d5bd}.p2p-brand-toast-close{color:#b6c5c1}}
    @media(prefers-reduced-motion:reduce){.p2p-brand-toast{animation:none}}
  `;
  (document.head||document.documentElement).appendChild(style);
  let host;
  function notify(message){
    const text=String(message??"");
    if(!host){host=document.createElement("div");host.id="p2p-brand-toast-host";host.setAttribute("aria-live","polite");host.setAttribute("aria-atomic","false");(document.body||document.documentElement).appendChild(host)}
    const item=document.createElement("div");item.className="p2p-brand-toast";item.setAttribute("role","status");
    const icon=document.createElement("span");icon.className="p2p-brand-toast-icon";icon.textContent=/fail|error|could not|invalid|insufficient|not found|unable/i.test(text)?"!":"✓";
    const copy=document.createElement("div");copy.className="p2p-brand-toast-copy";
    const title=document.createElement("div");title.className="p2p-brand-toast-title";title.textContent="P2P Social";
    const body=document.createElement("div");body.className="p2p-brand-toast-message";body.textContent=text;
    copy.append(title,body);
    const close=document.createElement("button");close.className="p2p-brand-toast-close";close.type="button";close.setAttribute("aria-label","Dismiss notification");close.textContent="×";close.onclick=()=>item.remove();
    item.append(icon,copy,close);host.appendChild(item);
    const timer=setTimeout(()=>{item.style.opacity="0";item.style.transform="translateY(-6px)";setTimeout(()=>item.remove(),180)},3000);
    close.addEventListener("click",()=>clearTimeout(timer),{once:true});
  }
  window.p2pNotify=notify;
  window.alert=notify;
})();