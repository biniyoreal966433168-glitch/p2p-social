/* Shared P2P Social logo: use the exact SVG shown in the Sell Market header. */
(() => {
  const applyLogo = () => {
    document.querySelectorAll(".logo-icon, .brand-icon").forEach(box => {
      if (box.querySelector("img.brand-logo")) return;
      const img = document.createElement("img");
      img.className = "brand-logo";
      img.src = "./p2p-logo.svg";
      img.alt = "P2P Social";
      img.style.cssText = "width:42px;height:42px;object-fit:contain;display:block;flex-shrink:0";
      box.replaceChildren(img);
      box.style.cssText += ";background:transparent;box-shadow:none;display:flex;align-items:center;justify-content:center;overflow:visible";
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyLogo, { once: true });
  else applyLogo();
})();