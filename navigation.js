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

/* Parknacross Weather social links — injected into the shared footer on every page. */
(() => {
  "use strict";

  const FACEBOOK_URL = "https://www.facebook.com/1361994206992789";
  const X_URL = "https://x.com/ParknacrossWx";

  const footer = document.querySelector("footer");
  if (!footer) return;

  let contact = footer.querySelector(".footer-links");
  if (!contact) {
    const spans = footer.querySelectorAll(":scope > span");
    contact = spans.length >= 3 ? spans[2] : document.createElement("span");
    contact.classList.add("footer-links");
    if (!contact.parentElement) footer.appendChild(contact);
  }

  const email = contact.querySelector('a[href^="mailto:"]');
  if (email) {
    email.classList.add("footer-email-link");
    email.setAttribute("aria-label", "Email Parknacross Weather");
  }

  function addSeparator() {
    const separator = document.createElement("span");
    separator.className = "footer-link-separator";
    separator.setAttribute("aria-hidden", "true");
    separator.textContent = "·";
    contact.appendChild(separator);
  }

  function addSocialLink(label, shortLabel, url, cssClass) {
    if (!url || contact.querySelector(`.${cssClass}`)) return;
    if (contact.children.length) addSeparator();
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = `footer-social-link ${cssClass}`;
    link.dataset.shortLabel = shortLabel;
    link.textContent = label;
    link.setAttribute("aria-label", `Follow Parknacross Weather on ${label}`);
    contact.appendChild(link);
  }

  addSocialLink("Facebook", "FB", FACEBOOK_URL, "footer-facebook-link");
  addSocialLink("X", "X", X_URL, "footer-x-link");
})();

