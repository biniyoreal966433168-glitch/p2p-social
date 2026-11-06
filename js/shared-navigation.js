(function () {
  "use strict";

  const file = decodeURIComponent((location.pathname.split("/").pop() || "index.html"));
  const isBuy = file.startsWith("🟢");
  const isSell = file.startsWith("🔴");
  const page = file === "index.html" ? "home"
    : file === "profile.html" ? "profile"
    : file === "message.html" ? "messages"
    : isBuy ? "buy"
    : isSell ? "sell"
    : "";

  const style = document.createElement("style");
  style.id = "p2p-shared-navigation-style";
  style.textContent = `
    body { padding-bottom: calc(104px + env(safe-area-inset-bottom, 0px)) !important; }
    .p2p-bottom-nav {
      position: fixed; z-index: 9999; left: 10px; right: 10px;
      bottom: max(10px, env(safe-area-inset-bottom, 0px));
      width: min(650px, calc(100% - 20px)); height: 74px; margin: 0 auto;
      display: grid; grid-template-columns: .82fr 2.25fr 1fr .82fr;
      align-items: center; gap: 6px; padding: 7px;
      background: rgba(255,255,255,.97); border: 1px solid #e5eeec;
      border-radius: 23px; box-shadow: 0 8px 28px rgba(20,55,52,.13);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    }
    .p2p-bottom-nav a {
      min-width: 0; height: 58px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 3px;
      border: 0; border-radius: 15px; color: #64748b;
      text-decoration: none; font: 700 10px/1.1 Arial,sans-serif;
      -webkit-tap-highlight-color: transparent; transition: background .18s,color .18s;
    }
    .p2p-bottom-nav .p2p-nav-icon { font-size: 21px; line-height: 22px; }
    .p2p-bottom-nav a.p2p-nav-active { color: #087f73; background: #eaf7f4; }
    .p2p-market-switch {
      height: 58px; min-width: 0; display: flex; overflow: hidden;
      border-radius: 16px; background: #f1f5f4; border: 1px solid #e1e9e7;
      box-shadow: inset 0 1px 2px rgba(15,40,35,.06);
    }
    .p2p-market-switch a {
      flex: 1; height: 100%; min-width: 0; border-radius: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 2px; color: #64748b; text-decoration: none;
      font: 800 11px/1 Arial,sans-serif; -webkit-tap-highlight-color: transparent;
    }
    .p2p-market-switch a + a { border-left: 2px solid rgba(255,255,255,.9); }
    .p2p-market-switch .p2p-buy { color: #087f73; }
    .p2p-market-switch .p2p-sell { color: #dc3545; }
    .p2p-market-switch .p2p-buy.p2p-market-active {
      color: #fff; background: linear-gradient(145deg,#0aa58e,#087f73);
    }
    .p2p-market-switch .p2p-sell.p2p-market-active {
      color: #fff; background: linear-gradient(145deg,#f0525f,#dc2638);
    }
    .p2p-market-arrow { font-size: 19px; line-height: 20px; }
    .p2p-nav-badge {
      position: absolute; top: 3px; right: 5px; min-width: 17px; height: 17px;
      padding: 0 4px; display: none; align-items: center; justify-content: center;
      border-radius: 20px; background: #e5484d; color: #fff;
      font: 800 9px/1 Arial,sans-serif; border: 2px solid #fff;
    }
    .p2p-bottom-nav .p2p-messages-link { position: relative; }
    @media (max-width: 360px) {
      .p2p-bottom-nav { left: 6px; right: 6px; width: calc(100% - 12px); grid-template-columns: .72fr 2.1fr .95fr .72fr; gap: 3px; padding: 5px; }
      .p2p-bottom-nav a { font-size: 9px; }
      .p2p-market-switch a { font-size: 10px; }
    }
  `;
  document.head.appendChild(style);

  let nav = document.querySelector("nav.bottom-nav");
  if (!nav) {
    nav = document.createElement("nav");
    document.body.appendChild(nav);
  }
  nav.className = "p2p-bottom-nav";
  nav.setAttribute("aria-label", "Main navigation");
  nav.innerHTML = `
    <a href="./index.html" class="${page === "home" ? "p2p-nav-active" : ""}" ${page === "home" ? 'aria-current="page"' : ""}>
      <span class="p2p-nav-icon" aria-hidden="true">⌂</span><span>Home</span>
    </a>
    <div class="p2p-market-switch" role="group" aria-label="Buy and Sell markets">
      <a class="p2p-buy ${page === "buy" ? "p2p-market-active" : ""}" href="./🟢.html" ${page === "buy" ? 'aria-current="page"' : ""}>
        <span class="p2p-market-arrow" aria-hidden="true">↑</span><span>Buy</span>
      </a>
      <a class="p2p-sell ${page === "sell" ? "p2p-market-active" : ""}" href="./🔴.html" ${page === "sell" ? 'aria-current="page"' : ""}>
        <span class="p2p-market-arrow" aria-hidden="true">↓</span><span>Sell</span>
      </a>
    </div>
    <a href="./message.html" class="p2p-messages-link ${page === "messages" ? "p2p-nav-active" : ""}" ${page === "messages" ? 'aria-current="page"' : ""}>
      <span class="p2p-nav-icon" aria-hidden="true">▤</span><span>Messages</span>
      <span id="messagesNavBadge" class="p2p-nav-badge" aria-live="polite"></span>
    </a>
    <a href="./profile.html" class="${page === "profile" ? "p2p-nav-active" : ""}" ${page === "profile" ? 'aria-current="page"' : ""}>
      <span class="p2p-nav-icon" aria-hidden="true">♙</span><span>Profile</span>
    </a>
  `;
})();