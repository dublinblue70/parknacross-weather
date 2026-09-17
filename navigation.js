(() => {
  "use strict";
  const buttons = [...document.querySelectorAll(".nav-more-button")];
  if (!buttons.length) return;

  function closeAll(except = null) {
    buttons.forEach(button => {
      if (button === except) return;
      const menu = button.parentElement?.querySelector(".nav-more-menu");
      if (menu) menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
  }

  function positionMenu(button, menu) {
    menu.hidden = false;
    menu.style.visibility = "hidden";
    const rect = button.getBoundingClientRect();
    const width = Math.min(248, Math.max(210, menu.offsetWidth || 220));
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    let top = rect.bottom + 8;
    const estimatedHeight = menu.offsetHeight || 330;
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 8);
    }
    menu.style.width = `${width}px`;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = "visible";
  }

  buttons.forEach(button => {
    const menu = button.parentElement?.querySelector(".nav-more-menu");
    if (!menu) return;
    button.addEventListener("click", event => {
      event.stopPropagation();
      const opening = menu.hidden;
      closeAll(opening ? button : null);
      if (opening) {
        positionMenu(button, menu);
        button.setAttribute("aria-expanded", "true");
        menu.querySelector("a")?.focus({preventScroll:true});
      } else {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
    menu.addEventListener("keydown", event => {
      const items=[...menu.querySelectorAll('a')];
      const index=items.indexOf(document.activeElement);
      if(event.key==='Escape'){
        menu.hidden=true;button.setAttribute('aria-expanded','false');button.focus();
      }else if(event.key==='ArrowDown'){
        event.preventDefault();items[(index+1+items.length)%items.length]?.focus();
      }else if(event.key==='ArrowUp'){
        event.preventDefault();items[(index-1+items.length)%items.length]?.focus();
      }
    });
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".nav-more")) closeAll();
  });
  window.addEventListener("resize", () => closeAll());
  window.addEventListener("scroll", () => closeAll(), {passive:true});
})();

/* v38.4.22 — canonical footer contact/social links.
   Defensive normaliser: regardless of older cached/merged footer markup,
   each footer ends with exactly one Email · Facebook · X group. */
(() => {
  "use strict";

  const EMAIL = "mailto:info@parknacrossweather.ie";
  const FACEBOOK = "https://www.facebook.com/1361994206992789";
  const X = "https://x.com/ParknacrossWx";

  function isParknacrossFooterLink(anchor) {
    const href = (anchor.getAttribute("href") || "").trim().toLowerCase();
    return href.startsWith("mailto:info@parknacrossweather.ie") ||
      href.includes("facebook.com/1361994206992789") ||
      href.includes("x.com/parknacrosswx");
  }

  function makeLink(label, href, ariaLabel) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    a.setAttribute("aria-label", ariaLabel);
    if (!href.startsWith("mailto:")) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    return a;
  }

  function appendSeparator(nav) {
    const sep = document.createElement("span");
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";
    nav.appendChild(sep);
  }

  function normaliseFooter(footer) {
    // Remove every previous canonical block first.
    footer.querySelectorAll(".footer-links").forEach(node => node.remove());

    // Remove legacy standalone copies that may have been added by an older release.
    footer.querySelectorAll("a").forEach(anchor => {
      if (isParknacrossFooterLink(anchor)) anchor.remove();
    });

    // Remove empty wrapper spans left behind by old footer implementations.
    footer.querySelectorAll("span").forEach(span => {
      if (span.closest(".footer-links")) return;
      const text = (span.textContent || "").replace(/[·|•\s]/g, "");
      if (!text && !span.querySelector("a, img, svg")) span.remove();
    });

    const nav = document.createElement("nav");
    nav.className = "footer-links";
    nav.setAttribute("aria-label", "Parknacross Weather contact and social links");

    nav.appendChild(makeLink("Email", EMAIL, "Email Parknacross Weather"));
    appendSeparator(nav);
    nav.appendChild(makeLink("Facebook", FACEBOOK, "Parknacross Weather on Facebook"));
    appendSeparator(nav);
    nav.appendChild(makeLink("X", X, "Parknacross Weather on X, @ParknacrossWx"));

    footer.appendChild(nav);
  }

  function normaliseAllFooters() {
    document.querySelectorAll("footer").forEach(normaliseFooter);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normaliseAllFooters, { once: true });
  } else {
    normaliseAllFooters();
  }

  // Covers BFCache/PWA restores without ever accumulating another copy.
  window.addEventListener("pageshow", normaliseAllFooters);
})();
