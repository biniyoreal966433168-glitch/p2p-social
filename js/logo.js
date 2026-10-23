/* Shared P2P Social logo and white logo bar across pages. */
(() => {
  const applyLogo = () => {
    document.querySelectorAll(".logo-icon, .brand-icon").forEach(box => {
      let img = box.querySelector("img.brand-logo");
      if (!img) {
        img = document.createElement("img");
        img.className = "brand-logo";
        img.src = "/p2p-logo.svg";
        img.alt = "P2P Social";
        box.replaceChildren(img);
      }
      box.style.cssText += ";background:#fff;box-shadow:none;border-radius:12px;padding:2px;display:flex;align-items:center;justify-content:center;overflow:visible;flex-shrink:0";
      img.style.cssText = "width:42px;height:42px;object-fit:contain;display:block;flex-shrink:0";
    });

    document.querySelectorAll(".logo-area, .brand-header").forEach(area => {
      area.style.backgroundColor = "#fff";
      area.style.borderRadius = "12px";
      area.style.padding = "3px 7px";
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyLogo, { once: true });
  else applyLogo();
})();