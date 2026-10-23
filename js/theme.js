(function(){
  const KEY="p2p-social-theme";
  const css=`
    body.night-mode{background:#111827!important;color:#e5e7eb!important;color-scheme:dark}
    body.night-mode :is(header,main,section,article,aside,nav,footer,.card,.container,.modal,.modal-content,.box,.panel,.form-container,.auth-container,.message-list,.chat-container,.order-card,.market-card,.profile-card,.settings-card,.content,.wrapper,.chat-list,.sidebar,.settings-item,.modal-box,.history-box,.order-box,.create-box,.post-card,.feedback-summary,.feedback-item){background-color:#1f2937!important;color:#e5e7eb!important}
    body.night-mode :is(input,select,textarea){background-color:#273449!important;color:#f3f4f6!important;border-color:#4b5563!important;color-scheme:dark}
    body.night-mode :is(.muted,.subtitle,.description,.hint,.text-muted){color:#cbd5e1!important}
    #p2p-global-theme-toggle{position:fixed;right:12px;top:12px;z-index:2147483000;border:1px solid #087f73;border-radius:999px;background:#087f73;color:#fff;font:600 13px/1.2 system-ui,sans-serif;padding:9px 12px;box-shadow:0 2px 10px #0002;cursor:pointer}
    body.night-mode #p2p-global-theme-toggle{background:#263746;color:#fff;border-color:#4f8e87}
  `;
  function apply(mode){const night=mode==="night";document.body.classList.toggle("night-mode",night);try{localStorage.setItem(KEY,night?"night":"day")}catch{}const b=document.getElementById("p2p-global-theme-toggle");if(b)b.textContent=night?"☀️ Day Mode":"🌙 Night Mode"}
  function init(){if(!document.getElementById("p2p-global-theme-css")){const style=document.createElement("style");style.id="p2p-global-theme-css";style.textContent=css;document.head.appendChild(style)}try{if(localStorage.getItem(KEY)==="night")document.body.classList.add("night-mode")}catch{}if(!document.getElementById("p2p-global-theme-toggle")){const b=document.createElement("button");b.id="p2p-global-theme-toggle";b.type="button";b.onclick=()=>apply(document.body.classList.contains("night-mode")?"day":"night");b.textContent=document.body.classList.contains("night-mode")?"☀️ Day Mode":"🌙 Night Mode";b.setAttribute("aria-label","Toggle Day Mode or Night Mode");document.body.appendChild(b)}window.p2pSetTheme=apply;window.p2pToggleTheme=()=>apply(document.body.classList.contains("night-mode")?"day":"night")}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();