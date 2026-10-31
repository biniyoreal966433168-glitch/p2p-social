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
  function confirmAction(message,options={}){
    return new Promise(resolve=>{
      const overlay=document.createElement("div");
      overlay.style.cssText="position:fixed;inset:0;z-index:2147483646;background:rgba(8,18,16,.58);display:grid;place-items:center;padding:22px;font-family:inherit";
      const panel=document.createElement("section");
      panel.setAttribute("role","alertdialog");panel.setAttribute("aria-modal","true");panel.setAttribute("aria-labelledby","p2p-confirm-title");
      panel.style.cssText="width:min(100%,390px);background:var(--p2p-modal-bg,#fff);color:var(--p2p-modal-text,#172321);border:1px solid rgba(8,127,115,.18);border-radius:20px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.28)";
      const heading=document.createElement("div");heading.style.cssText="display:flex;align-items:center;gap:10px;margin-bottom:12px";
      const mark=document.createElement("span");mark.textContent="P";mark.style.cssText="width:34px;height:34px;border-radius:11px;background:#087f73;color:white;display:grid;place-items:center;font-weight:800";
      const title=document.createElement("strong");title.id="p2p-confirm-title";title.textContent=options.title||"P2P Social";title.style.cssText="font-size:16px;color:#087f73";
      heading.append(mark,title);
      const msg=document.createElement("p");msg.textContent=String(message??"");msg.style.cssText="font-size:15px;line-height:1.5;margin:0 0 22px;overflow-wrap:anywhere";
      const actions=document.createElement("div");actions.style.cssText="display:flex;justify-content:flex-end;gap:10px";
      const cancel=document.createElement("button");cancel.type="button";cancel.textContent=options.cancelText||"Cancel";cancel.style.cssText="border:1px solid #d8e3e0;background:transparent;color:inherit;border-radius:11px;padding:10px 17px;font:600 14px inherit";
      const ok=document.createElement("button");ok.type="button";ok.textContent=options.confirmText||"Confirm";ok.style.cssText="border:0;background:#087f73;color:#fff;border-radius:11px;padding:10px 18px;font:650 14px inherit";
      function finish(value){document.removeEventListener("keydown",onKey);overlay.remove();resolve(value)}
      function onKey(e){if(e.key==="Escape")finish(false);if(e.key==="Enter")finish(true)}
      cancel.onclick=()=>finish(false);ok.onclick=()=>finish(true);overlay.addEventListener("click",e=>{if(e.target===overlay)finish(false)});
      actions.append(cancel,ok);panel.append(heading,msg,actions);overlay.appendChild(panel);document.body.appendChild(overlay);document.addEventListener("keydown",onKey);cancel.focus();
    });
  }
  function promptAction(message,defaultValue="",options={}){
    return new Promise(resolve=>{
      const overlay=document.createElement("div");
      overlay.style.cssText="position:fixed;inset:0;z-index:2147483646;background:rgba(8,18,16,.58);display:grid;place-items:center;padding:22px;font-family:inherit";
      const panel=document.createElement("section");
      panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");panel.setAttribute("aria-labelledby","p2p-prompt-title");
      panel.style.cssText="width:min(100%,410px);background:var(--p2p-modal-bg,#fff);color:var(--p2p-modal-text,#172321);border:1px solid rgba(8,127,115,.18);border-radius:20px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.28)";
      const heading=document.createElement("div");heading.style.cssText="display:flex;align-items:center;gap:10px;margin-bottom:12px";
      const mark=document.createElement("span");mark.textContent="P";mark.style.cssText="width:34px;height:34px;border-radius:11px;background:#087f73;color:white;display:grid;place-items:center;font-weight:800";
      const title=document.createElement("strong");title.id="p2p-prompt-title";title.textContent=options.title||"P2P Social";title.style.cssText="font-size:16px;color:#087f73";
      heading.append(mark,title);
      const msg=document.createElement("p");msg.textContent=String(message??"");msg.style.cssText="font-size:15px;line-height:1.5;margin:0 0 14px";
      const field=document.createElement(options.multiline?"textarea":"input");if(!options.multiline)field.type="text";field.value=String(defaultValue??"");field.placeholder=options.placeholder||"Enter your response";field.maxLength=options.maxLength||1000;
      field.style.cssText="box-sizing:border-box;width:100%;min-height:"+(options.multiline?"104px":"46px")+";padding:12px;border:1px solid #cbd9d5;border-radius:11px;background:transparent;color:inherit;font:14px inherit;outline-color:#087f73;resize:vertical";
      const actions=document.createElement("div");actions.style.cssText="display:flex;justify-content:flex-end;gap:10px;margin-top:20px";
      const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancel";cancel.style.cssText="border:1px solid #d8e3e0;background:transparent;color:inherit;border-radius:11px;padding:10px 17px;font:600 14px inherit";
      const ok=document.createElement("button");ok.type="button";ok.textContent=options.confirmText||"Submit";ok.style.cssText="border:0;background:#087f73;color:#fff;border-radius:11px;padding:10px 18px;font:650 14px inherit";
      function finish(value){document.removeEventListener("keydown",onKey);overlay.remove();resolve(value)}
      function onKey(e){if(e.key==="Escape")finish(null);if(e.key==="Enter"&&!options.multiline){e.preventDefault();finish(field.value)}}
      cancel.onclick=()=>finish(null);ok.onclick=()=>finish(field.value);overlay.addEventListener("click",e=>{if(e.target===overlay)finish(null)});
      actions.append(cancel,ok);panel.append(heading,msg,field,actions);overlay.appendChild(panel);document.body.appendChild(overlay);document.addEventListener("keydown",onKey);field.focus();
    });
  }
  window.p2pNotify=notify;
  window.p2pConfirm=confirmAction;
  window.p2pPrompt=promptAction;
  window.alert=notify;
})();