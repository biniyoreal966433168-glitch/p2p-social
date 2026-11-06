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
    .p2p-market-switch { height: 58px; min-width: 0; display: flex; overflow: hidden; border-radius: 16px; background: #f1f5f4; border: 1px solid #e1e9e7; box-shadow: inset 0 1px 2px rgba(15,40,35,.06); }
    .p2p-market-switch a { flex: 1; height: 100%; min-width: 0; border-radius: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: #64748b; text-decoration: none; font: 800 11px/1 Arial,sans-serif; -webkit-tap-highlight-color: transparent; }
    .p2p-market-switch a + a { border-left: 2px solid rgba(255,255,255,.9); }
    .p2p-market-switch .p2p-buy { color: #087f73; }
    .p2p-market-switch .p2p-sell { color: #dc3545; }
    .p2p-market-switch .p2p-buy.p2p-market-active { color: #fff; background: linear-gradient(145deg,#0aa58e,#087f73); }
    .p2p-market-switch .p2p-sell.p2p-market-active { color: #fff; background: linear-gradient(145deg,#f0525f,#dc2638); }
    .p2p-market-arrow { font-size: 19px; line-height: 20px; }
    .p2p-nav-badge { position: absolute; top: 3px; right: 5px; min-width: 17px; height: 17px; padding: 0 4px; display: none; align-items: center; justify-content: center; border-radius: 20px; background: #e5484d; color: #fff; font: 800 9px/1 Arial,sans-serif; border: 2px solid #fff; }
    .p2p-bottom-nav .p2p-messages-link { position: relative; }

    /* Shared premium notification treatment */
    .notification-wrap, .top-actions, .profile-header-actions, header { position: relative; }
    .notification, #notificationButton {
      -webkit-tap-highlight-color: transparent; cursor: pointer;
      transition: transform .16s ease, background .16s ease, box-shadow .16s ease;
    }
    .notification:active, #notificationButton:active { transform: scale(.96); }
    .notification-badge, #notificationBadge {
      min-width: 19px; height: 19px; padding: 0 5px; border-radius: 20px;
      background: #e5484d; color: #fff; border: 2px solid #087f73;
      font: 800 10px/1 Arial,sans-serif; box-shadow: 0 2px 7px rgba(0,0,0,.16);
    }
    .notification-panel, #notificationPanel {
      border: 1px solid #e5eeec; border-radius: 18px;
      background: #fff; color: #172033;
      box-shadow: 0 18px 50px rgba(16,35,32,.20);
      overflow: hidden; backdrop-filter: blur(16px);
    }
    .notification-header, .notification-head {
      min-height: 58px; padding: 14px 16px; display: flex;
      align-items: center; justify-content: space-between; gap: 12px;
      background: linear-gradient(180deg,#fff,#f8fcfb);
      border-bottom: 1px solid #edf2f1;
    }
    .notification-header strong, .notification-head strong {
      color: #123e39; font-size: 15px; font-weight: 800; letter-spacing: -.2px;
    }
    .mark-all, #markAllNotifications {
      border: 0; border-radius: 9px; padding: 8px 10px;
      background: #eaf7f4; color: #087f73; font-size: 11px;
      font-weight: 800; cursor: pointer;
    }
    .notification-list, #notificationList { max-height: min(420px,65vh); overflow-y: auto; overscroll-behavior: contain; }
    .notification-item {
      display: flex; align-items: flex-start; gap: 11px; padding: 13px 15px;
      border-bottom: 1px solid #f0f4f3; cursor: pointer;
      transition: background .15s ease;
    }
    .notification-item:hover { background: #f7fbfa; }
    .notification-item.unread { background: #eff9f6; }
    .notification-icon {
      width: 40px; height: 40px; flex: 0 0 40px; border-radius: 13px;
      display: flex; align-items: center; justify-content: center;
      background: #e2f4ef; color: #087f73; font-size: 19px;
    }
    .notification-title { color: #172b2a; font-size: 13px; font-weight: 800; line-height: 1.35; }
    .notification-body, .notification-text { color: #64736f; font-size: 12px; line-height: 1.45; margin-top: 3px; }
    .notification-time { color: #97a39f; font-size: 10px; margin-top: 6px; }
    .no-notifications, .notification-empty { padding: 38px 16px; text-align: center; color: #83918d; font-size: 13px; }
    .p2p-notification-trigger {
      position: absolute; z-index: 20; top: 10px; right: 12px;
      width: 44px; height: 44px; border: 1px solid rgba(255,255,255,.36);
      border-radius: 15px; background: rgba(255,255,255,.16);
      color: #fff; display: inline-flex; align-items: center; justify-content: center;
      font-size: 21px; cursor: pointer; box-shadow: 0 5px 15px rgba(0,0,0,.10);
      -webkit-tap-highlight-color: transparent;
    }
    .p2p-notification-trigger:hover { background: rgba(255,255,255,.25); }
    .p2p-notification-trigger .p2p-notification-count {
      position: absolute; top: -6px; right: -6px; min-width: 19px; height: 19px;
      padding: 0 5px; border-radius: 20px; display: none; align-items: center;
      justify-content: center; border: 2px solid #087f73; background: #e5484d;
      color: #fff; font: 800 10px/1 Arial,sans-serif;
    }
    .p2p-notification-panel {
      position: fixed; z-index: 10020; top: 72px; right: 12px;
      width: min(380px,calc(100vw - 24px)); max-height: min(520px,72vh);
      display: none; border: 1px solid #e5eeec; border-radius: 18px;
      background: #fff; color: #172033; box-shadow: 0 18px 50px rgba(16,35,32,.22);
      overflow: hidden;
    }
    .p2p-notification-panel.open { display: block; }
    .p2p-notification-panel .p2p-notification-list { max-height: min(420px,60vh); overflow-y: auto; }
    .p2p-notification-panel .p2p-notification-row {
      display: flex; gap: 11px; padding: 13px 15px; border-bottom: 1px solid #f0f4f3;
      cursor: pointer; background: #fff;
    }
    .p2p-notification-panel .p2p-notification-row.unread { background: #eff9f6; }
    .p2p-notification-panel .p2p-notification-symbol {
      flex: 0 0 40px; width: 40px; height: 40px; border-radius: 13px;
      display: grid; place-items: center; background: #e2f4ef; font-size: 19px;
    }
    .p2p-notification-panel .p2p-notification-copy { min-width: 0; flex: 1; }
    .p2p-notification-panel .p2p-notification-title { color: #172b2a; font-size: 13px; font-weight: 800; }
    .p2p-notification-panel .p2p-notification-message { margin-top: 3px; color: #64736f; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
    .p2p-notification-panel .p2p-notification-time { margin-top: 6px; color: #97a39f; font-size: 10px; }
    .p2p-notification-panel .p2p-notification-empty { padding: 38px 16px; text-align: center; color: #83918d; font-size: 13px; }
    @media (max-width: 360px) {
      .p2p-bottom-nav { left: 6px; right: 6px; width: calc(100% - 12px); grid-template-columns: .72fr 2.1fr .95fr .72fr; gap: 3px; padding: 5px; }
      .p2p-bottom-nav a { font-size: 9px; }
      .p2p-market-switch a { font-size: 10px; }
      .p2p-notification-panel { right: 8px; width: calc(100vw - 16px); }
    }
  `;
  document.head.appendChild(style);

  let nav = document.querySelector("nav.bottom-nav");
  if (!nav) { nav = document.createElement("nav"); document.body.appendChild(nav); }
  nav.className = "p2p-bottom-nav";
  nav.setAttribute("aria-label", "Main navigation");
  nav.innerHTML = `
    <a href="./index.html" class="${page === "home" ? "p2p-nav-active" : ""}" ${page === "home" ? 'aria-current="page"' : ""}><span class="p2p-nav-icon" aria-hidden="true">⌂</span><span>Home</span></a>
    <div class="p2p-market-switch" role="group" aria-label="Buy and Sell markets">
      <a class="p2p-buy ${page === "buy" ? "p2p-market-active" : ""}" href="./🟢.html" ${page === "buy" ? 'aria-current="page"' : ""}><span class="p2p-market-arrow" aria-hidden="true">↑</span><span>Buy</span></a>
      <a class="p2p-sell ${page === "sell" ? "p2p-market-active" : ""}" href="./🔴.html" ${page === "sell" ? 'aria-current="page"' : ""}><span class="p2p-market-arrow" aria-hidden="true">↓</span><span>Sell</span></a>
    </div>
    <a href="./message.html" class="p2p-messages-link ${page === "messages" ? "p2p-nav-active" : ""}" ${page === "messages" ? 'aria-current="page"' : ""}><span class="p2p-nav-icon" aria-hidden="true">▤</span><span>Messages</span><span id="messagesNavBadge" class="p2p-nav-badge" aria-live="polite"></span></a>
    <a href="./profile.html" class="${page === "profile" ? "p2p-nav-active" : ""}" ${page === "profile" ? 'aria-current="page"' : ""}><span class="p2p-nav-icon" aria-hidden="true">♙</span><span>Profile</span></a>
  `;

  // Home and Messages already have a live notification center. Keep their existing
  // Supabase logic and only apply the shared styling there.
  if (document.getElementById("notificationButton") || document.getElementById("notificationPanel")) {
    const existingButton = document.getElementById("notificationButton");
    if (existingButton) {
      existingButton.setAttribute("aria-label", "Notifications");
      existingButton.setAttribute("title", "Notifications");
      if (existingButton.tagName !== "BUTTON") {
        existingButton.setAttribute("role", "button");
        existingButton.setAttribute("tabindex", "0");
        existingButton.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); existingButton.click(); }
        });
      }
    }
    return;
  }

  // Add the same real notification center to Profile, public profiles and all markets.
  const header = document.querySelector("header");
  if (!header || !window.supabase?.createClient) return;
  const host = document.createElement("div");
  host.className = "p2p-notification-host";
  const profileActions = header.querySelector(".profile-header-actions");
  if (profileActions) { profileActions.style.display = "flex"; profileActions.style.alignItems = "center"; profileActions.style.gap = "8px"; host.style.position = "relative"; host.style.display = "inline-flex"; }
  host.innerHTML = `
    <button type="button" class="p2p-notification-trigger" aria-label="Open notifications" title="Notifications">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span class="p2p-notification-count" aria-live="polite"></span>
    </button>
    <section class="p2p-notification-panel" aria-label="Notifications" aria-hidden="true">
      <div class="notification-header"><strong>Notifications</strong><button type="button" class="mark-all p2p-mark-all">Mark all read</button></div>
      <div class="p2p-notification-list"><div class="p2p-notification-empty">Sign in to view your notifications.</div></div>
    </section>`;
  if (profileActions) profileActions.appendChild(host); else { const security = header.querySelector(".security"); if (security) security.style.marginRight = "52px"; header.appendChild(host); }
  const trigger = host.querySelector(".p2p-notification-trigger");
  const panel = host.querySelector(".p2p-notification-panel");
  const list = host.querySelector(".p2p-notification-list");
  const count = host.querySelector(".p2p-notification-count");
  const markAll = host.querySelector(".p2p-mark-all");
  const supabaseUrl = "https://mbsvuwrgigqfporxwpfr.supabase.co";
  const supabaseKey = "sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa";
  const client = window.supabase.createClient(supabaseUrl, supabaseKey);
  let activeUser = null, channel = null, notifications = [];

  const escapeText = value => String(value ?? "");
  const iconFor = type => ({
    message:"💬",like:"❤️",comment:"🗨️",follow:"👤",wallet:"👛",
    deposit:"⬇️",withdraw:"⬆️",transfer:"↔️",trade:"🤝",premium:"✦",
    live:"🔴",verification:"✓",security:"🛡️"
  }[String(type || "").toLowerCase()] || "🔔");
  const timeFor = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
    return date.toLocaleDateString([], {month:"short",day:"numeric"});
  };
  function updateCount() {
    const unread = notifications.filter(item => !item.is_read).length;
    count.textContent = unread > 99 ? "99+" : String(unread);
    count.style.display = unread ? "flex" : "none";
  }
  function render() {
    list.replaceChildren();
    updateCount();
    if (!notifications.length) {
      const empty = document.createElement("div");
      empty.className = "p2p-notification-empty";
      empty.textContent = "You're all caught up. No notifications yet.";
      list.appendChild(empty);
      return;
    }
    notifications.forEach(item => {
      const row = document.createElement("div");
      row.className = "p2p-notification-row" + (item.is_read ? "" : " unread");
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      const symbol = document.createElement("div");
      symbol.className = "p2p-notification-symbol";
      symbol.textContent = iconFor(item.type);
      const copy = document.createElement("div");
      copy.className = "p2p-notification-copy";
      const title = document.createElement("div");
      title.className = "p2p-notification-title";
      title.textContent = item.title || "Notification";
      const message = document.createElement("div");
      message.className = "p2p-notification-message";
      message.textContent = item.body || item.message || "You have a new notification.";
      const time = document.createElement("div");
      time.className = "p2p-notification-time";
      time.textContent = timeFor(item.created_at);
      copy.append(title, message, time);
      row.append(symbol, copy);
      const open = async () => {
        if (!item.is_read) {
          const result = await client.from("notifications").update({is_read:true}).eq("id",item.id).eq("user_id",activeUser.id);
          if (!result.error) item.is_read = true;
          render();
        }
        const destination = item.link || (item.conversation_id ? "./message.html?conversation_id=" + encodeURIComponent(item.conversation_id) : "");
        if (destination) location.href = destination;
      };
      row.addEventListener("click", open);
      row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      list.appendChild(row);
    });
  }
  async function load() {
    if (!activeUser) return;
    const result = await client.from("notifications").select("*").eq("user_id",activeUser.id).order("created_at",{ascending:false}).limit(50);
    if (result.error) {
      list.innerHTML = "";
      const error = document.createElement("div");
      error.className = "p2p-notification-empty";
      error.textContent = "Notifications are temporarily unavailable.";
      list.appendChild(error);
      return;
    }
    notifications = result.data || [];
    render();
  }
  async function start() {
    const result = await client.auth.getSession();
    activeUser = result.data?.session?.user || null;
    if (!activeUser) return;
    await load();
    channel = client.channel("p2p-shared-notifications-" + activeUser.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:"user_id=eq." + activeUser.id},load)
      .subscribe();
  }
  function closePanel() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden","true");
    trigger.setAttribute("aria-expanded","false");
  }
  trigger.addEventListener("click", async event => {
    event.stopPropagation();
    const open = !panel.classList.contains("open");
    panel.classList.toggle("open",open);
    panel.setAttribute("aria-hidden",String(!open));
    trigger.setAttribute("aria-expanded",String(open));
    if (open) await load();
  });
  markAll.addEventListener("click", async () => {
    if (!activeUser || !notifications.some(item => !item.is_read)) return;
    const result = await client.from("notifications").update({is_read:true}).eq("user_id",activeUser.id).eq("is_read",false);
    if (!result.error) { notifications.forEach(item => item.is_read = true); render(); }
  });
  document.addEventListener("click", event => {
    if (!host.contains(event.target)) closePanel();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closePanel(); });
  start().catch(error => console.warn("Shared notifications unavailable:",error));
})();