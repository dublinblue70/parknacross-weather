(() => {
  "use strict";
  document.querySelectorAll(".nav").forEach(nav => {
    const menu = nav.querySelector(".nav-more-menu");
    const moreButton = nav.querySelector(".nav-more-button");
    if (!menu || !moreButton) return;
    ["station.html", "climate.html"].forEach(href => {
      const link = [...nav.children].find(node => node.matches?.(`a[href="${href}"]`));
      if (!link) return;
      link.setAttribute("role", "menuitem");
      menu.prepend(link);
      if (link.classList.contains("active")) moreButton.classList.add("nav-more-active");
    });
  });
  const buttons = [...document.querySelectorAll(".nav-more-button")];
  if (!buttons.length) return;
  const menuForButton = new Map();

  /*
   * Keep the popup outside the horizontally scrolling navigation and the
   * blurred, overflow-clipped page shell. Mobile Safari treats those
   * ancestors as the containing/clipping block for position:fixed children,
   * which made a correctly opened menu invisible on phones.
   */
  buttons.forEach(button => {
    const menu = button.parentElement?.querySelector(".nav-more-menu");
    if (!menu) return;
    menuForButton.set(button, menu);
    menu.dataset.navMorePopup = "true";
    document.body.appendChild(menu);
  });

  function closeAll(except = null) {
    buttons.forEach(button => {
      if (button === except) return;
      const menu = menuForButton.get(button);
      if (menu) menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
  }

  function positionMenu(button, menu) {
    const edge = 8;
    const gap = 8;

    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.maxHeight = "none";
    menu.style.overflowY = "visible";

    const rect = button.getBoundingClientRect();

    /*
     * v38.4.26: use a compact two-column menu. Eight secondary destinations
     * then fit comfortably in a normal laptop or phone viewport instead of
     * extending below the page. Keep an internal scroll fallback only for
     * unusually short browser windows or accessibility zoom levels.
     */
    const width = Math.min(340, Math.max(280, window.innerWidth - edge * 2));
    menu.style.width = `${width}px`;

    const left = Math.max(
      edge,
      Math.min(window.innerWidth - width - edge, rect.right - width)
    );
    menu.style.left = `${left}px`;

    const naturalHeight = menu.scrollHeight || menu.offsetHeight || 190;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - edge);
    const spaceAbove = Math.max(0, rect.top - gap - edge);
    const openBelow = spaceBelow >= naturalHeight || spaceBelow >= spaceAbove;
    const available = Math.max(120, openBelow ? spaceBelow : spaceAbove);
    const renderedHeight = Math.min(naturalHeight, available);

    menu.style.maxHeight = `${renderedHeight}px`;
    menu.style.overflowY = naturalHeight > renderedHeight ? "auto" : "visible";
    menu.style.top = openBelow
      ? `${Math.min(window.innerHeight - renderedHeight - edge, rect.bottom + gap)}px`
      : `${Math.max(edge, rect.top - gap - renderedHeight)}px`;
    menu.style.visibility = "visible";
  }

  buttons.forEach(button => {
    const menu = menuForButton.get(button);
    if (!menu) return;
    button.addEventListener("click", event => {
      event.stopPropagation();
      const opening = menu.hidden;
      closeAll(opening ? button : null);
      if (opening) {
        positionMenu(button, menu);
        button.setAttribute("aria-expanded", "true");
        /* Keep focus on the trigger for touch users. Keyboard users can move
           into the popup with ArrowDown, avoiding Safari's focus-scroll race. */
      } else {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
    button.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" && menu.hidden) {
        event.preventDefault();
        closeAll(button);
        positionMenu(button, menu);
        button.setAttribute("aria-expanded", "true");
        menu.querySelector("a")?.focus({preventScroll:true});
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
    const insideTrigger = event.target.closest?.(".nav-more");
    const insidePopup = event.target.closest?.('[data-nav-more-popup="true"]');
    if (!insideTrigger && !insidePopup) closeAll();
  });
  window.addEventListener("resize", () => closeAll());
  window.addEventListener("scroll", () => {
    buttons.forEach(button => {
      const menu = menuForButton.get(button);
      if (menu && !menu.hidden) positionMenu(button, menu);
    });
  }, {passive:true});
})();
