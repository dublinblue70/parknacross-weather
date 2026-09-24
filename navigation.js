(() => {
  "use strict";
  const buttons = [...document.querySelectorAll(".nav-more-button")];
  if (!buttons.length) return;
  const menuForButton = new Map();

  const navStyle = document.createElement("style");
  navStyle.textContent = `
    .nav-more-menu{grid-template-columns:1fr!important;gap:7px!important}
    .nav-menu-group{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 5px;padding-top:5px;border-top:1px solid rgba(190,220,238,.10)}
    .nav-menu-group:first-child{padding-top:0;border-top:0}
    .nav-menu-group-label{grid-column:1/-1;padding:2px 10px 1px;color:#7bd7ef;font-size:.69rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
    @media(max-width:360px){.nav-menu-group{grid-template-columns:1fr}}
  `;
  document.head.appendChild(navStyle);

  function groupMenu(menu, menuIndex) {
    if (menu.querySelector(".nav-menu-group")) return;
    const links = [...menu.querySelectorAll(":scope > a")];
    const groups = [
      ["Explore", links.slice(0, 5)],
      ["Reports", links.slice(5, 8)],
      ["Site & app", links.slice(8)]
    ];
    groups.forEach(([label, items], groupIndex) => {
      if (!items.length) return;
      const wrapper = document.createElement("div");
      const heading = document.createElement("span");
      const headingId = `navMoreGroup${menuIndex}-${groupIndex}`;
      wrapper.className = "nav-menu-group";
      wrapper.setAttribute("role", "group");
      wrapper.setAttribute("aria-labelledby", headingId);
      heading.className = "nav-menu-group-label";
      heading.id = headingId;
      heading.textContent = label;
      wrapper.append(heading, ...items);
      menu.appendChild(wrapper);
    });
  }

  /*
   * Keep the popup outside the horizontally scrolling navigation and the
   * blurred, overflow-clipped page shell. Mobile Safari treats those
   * ancestors as the containing/clipping block for position:fixed children,
   * which made a correctly opened menu invisible on phones.
   */
  buttons.forEach((button, menuIndex) => {
    const menu = button.parentElement?.querySelector(".nav-more-menu");
    if (!menu) return;
    groupMenu(menu, menuIndex);
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
      } else if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
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
