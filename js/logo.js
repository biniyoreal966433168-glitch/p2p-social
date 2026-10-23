/* Match the P2P Social logo and brand colors used on index.html across every page. */
(() => {
  const applyBrand = () => {
    document.querySelectorAll("header").forEach(header => {
      const brand = header.querySelector(".logo-area, .brand, .brand-header, .brand-name, .brand-logo, .logo-icon, .brand-icon");
      if (!brand) return;

      header.style.background = "linear-gradient(135deg,#075e54,#087f73)";
      header.style.color = "#fff";

      header.querySelectorAll("img.logo, img.logo-icon, img.brand-logo, img.brand-icon, img.logo-img").forEach(img => {
        img.src = "/p2p-logo.svg";
        img.alt = "P2P Social Logo";
        img.style.cssText = "width:45px;height:45px;border-radius:14px;object-fit:contain;display:block;flex-shrink:0;box-shadow:0 6px 15px rgba(0,0,0,.18);background:transparent;padding:0";
      });

      header.querySelectorAll(".logo-icon, .brand-icon").forEach(box => {
        let img = box.querySelector("img");
        if (!img) {
          img = document.createElement("img");
          img.src = "/p2p-logo.svg";
          img.alt = "P2P Social Logo";
          box.replaceChildren(img);
        }
        img.className = "brand-logo";
        img.style.cssText = "width:45px;height:45px;border-radius:14px;object-fit:contain;display:block;flex-shrink:0;box-shadow:0 6px 15px rgba(0,0,0,.18)";
        box.style.cssText += ";background:transparent;box-shadow:none;border-radius:0;padding:0;display:flex;align-items:center;justify-content:center;overflow:visible;flex-shrink:0";
      });

      header.querySelectorAll(".brand, .brand-name, .brand-text h1").forEach(el => {
        el.style.color = "#fff";
        el.style.fontWeight = "700";
      });
      header.querySelectorAll(".brand span, .brand-name span, .brand-text h1 span").forEach(el => {
        el.style.color = "#b9fff1";
      });
      header.querySelectorAll(".brand-text p").forEach(el => {
        el.style.color = "#e5fff9";
      });
      header.querySelectorAll(".security").forEach(el => {
        el.style.color = "#b9fff1";
      });
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyBrand, { once: true });
  else applyBrand();
})();