(() => {
  "use strict";

  const style = document.createElement("style");
  style.textContent = `
    .skip-link{position:fixed;left:12px;top:12px;z-index:100000;transform:translateY(-180%);padding:10px 14px;border-radius:10px;background:#fff;color:#07131f;font:700 14px/1.2 system-ui;text-decoration:none}
    .skip-link:focus{transform:translateY(0)}
    :where(a,button,input,select,textarea):focus-visible{outline:3px solid #7bd7ef;outline-offset:3px}
    .offline-banner{position:sticky;top:0;z-index:9999;margin:0 auto;padding:9px 14px;text-align:center;background:#563d16;color:#fff3d6;border-bottom:1px solid rgba(255,255,255,.18);font:700 13px/1.35 system-ui}
    .offline-banner[hidden]{display:none!important}
    @media(prefers-reduced-motion:reduce){html:focus-within{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
  `;
  document.head.appendChild(style);

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && window.Chart) {
    window.Chart.defaults.animation = false;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const main = document.querySelector("main");
    if (main && !main.id) main.id = "mainContent";

    if (main && !document.querySelector(".skip-link")) {
      const link = document.createElement("a");
      link.className = "skip-link";
      link.href = `#${main.id}`;
      link.textContent = "Skip to main content";
      document.body.prepend(link);
    }

    document.querySelectorAll("canvas").forEach(canvas => {
      if (canvas.hasAttribute("aria-label")) return;
      const card = canvas.closest(".chart-card, .chart-panel, section, article");
      const heading = card?.querySelector("h2,h3");
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        heading?.textContent?.trim()
          ? `${heading.textContent.trim()} chart`
          : "Parknacross weather chart"
      );
    });

    document.querySelectorAll("strong").forEach(value => {
      if (value.textContent.trim() !== "--") return;
      value.classList.add("loading-placeholder");
      const observer = new MutationObserver(() => {
        if (value.textContent.trim() !== "--") {
          value.classList.remove("loading-placeholder");
          observer.disconnect();
        }
      });
      observer.observe(value, { childList: true, characterData: true, subtree: true });
    });

    document.querySelectorAll(".footer-links").forEach(footerLinks => {
      const appendLink = (href, label) => {
        if (footerLinks.querySelector(`a[href="${href}"]`)) return;
        const separator = document.createElement("span");
        separator.setAttribute("aria-hidden", "true");
        separator.textContent = "·";
        const link = document.createElement("a");
        link.href = href;
        link.textContent = label;
        footerLinks.append(separator, link);
      };
      appendLink("install.html", "Install help");
      appendLink("privacy.html", "Privacy");
    });

    document.documentElement.classList.add("keyboard-focus-ready");
  });
})();
