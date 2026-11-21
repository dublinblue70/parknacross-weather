(() => {
  "use strict";
  // One visitor-first route hierarchy, shared by every public page.
  // Existing links are moved, not recreated, so active state and deep links survive.
  document.querySelectorAll("header .nav").forEach(primary => {
    const more = primary.querySelector(".nav-more");
    const menu = more?.querySelector(".nav-more-menu");
    if (!more || !menu) return;
    const today = primary.querySelector(':scope > a[href="index.html"]');
    if (today) today.textContent = "Today";
    for (const destination of ["summary.html", "history.html"]) {
      const link = primary.querySelector(':scope > a[href="' + destination + '"]');
      if (link) { link.setAttribute("role", "menuitem"); menu.appendChild(link); }
    }
    const sea = menu.querySelector('a[href="coast.html"]');
    if (sea) {
      sea.removeAttribute("role");
      primary.insertBefore(sea, more);
    }
    for (const path of ["index.html", "rain.html", "radar.html", "coast.html", "graphs.html"]) {
      const link = primary.querySelector(':scope > a[href="' + path + '"]');
      if (link) primary.insertBefore(link, more);
    }
    const page = location.pathname.split("/").pop() || "index.html";
    const moreButton = more.querySelector(".nav-more-button");
    if (moreButton) {
      const secondary = !["index.html","rain.html","radar.html","coast.html","graphs.html"].includes(page);
      moreButton.classList.toggle("nav-more-active", secondary);
    }
  });
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
  // First keyboard action goes to the page's content rather than through every nav link.
  const primaryContent = document.querySelector("main");
  if (primaryContent && !document.querySelector(".pw-skip-link")) {
    if (!primaryContent.id) primaryContent.id = "pw-main-content";
    const skip = document.createElement("a");
    skip.className = "pw-skip-link";
    skip.href = "#" + primaryContent.id;
    skip.textContent = "Skip to weather content";
    document.body.prepend(skip);
  }

  // Accessible five-target mobile navigation. The More menu has its own
  // popup so it can open next to the bottom trigger (not the hidden top bar).
  if (document.querySelector("main") && !document.querySelector(".pw-mobile-nav")) {
    const originalMenu = buttons[0]?.parentElement?.querySelector(".nav-more-menu");
    if (originalMenu) {
      const icons = {
        today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
        rain: '<path d="M20 16.6a4.6 4.6 0 0 0-2.5-8.3A6 6 0 0 0 6 9.8 3.7 3.7 0 0 0 5 17h1"/><path d="m9 16-1 4m5-4-1 4m5-4-1 4"/>',
        radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18.4 5.6M12 12h.01"/>',
        coast: '<path d="M2 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 21c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M5 10l7-7 7 7"/>',
        more: '<path d="M4 6h16M4 12h16M4 18h16"/>'
      };
      const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
      const mobileNav = document.createElement("nav");
      mobileNav.className = "pw-mobile-nav";
      mobileNav.setAttribute("aria-label", "Quick weather navigation");
      const page = location.pathname.split("/").pop() || "index.html";
      const targets = [["index.html","Today","today"],["rain.html","Rain","rain"],["radar.html","Radar","radar"],["coast.html","Sea","coast"]];
      for (const [href,label,glyph] of targets) {
        const item = document.createElement("a");
        item.href = href;
        item.className = "pw-mobile-nav-item";
        item.innerHTML = icon(glyph) + '<span>' + label + '</span>';
        item.setAttribute("aria-label", label === "Sea" ? "Sea and swim conditions" : label);
        if (page === href) { item.setAttribute("aria-current","page"); item.classList.add("is-current"); }
        mobileNav.appendChild(item);
      }
      const moreWrap = document.createElement("div");
      moreWrap.className = "nav-more pw-mobile-more";
      const mobileButton = document.createElement("button");
      mobileButton.type = "button";
      mobileButton.className = "nav-more-button pw-mobile-nav-item";
      mobileButton.setAttribute("aria-expanded","false");
      mobileButton.setAttribute("aria-haspopup","menu");
      mobileButton.setAttribute("aria-label","More weather pages");
      mobileButton.innerHTML = icon("more") + "<span>More</span>";
      if (!targets.some(([href]) => href === page)) mobileButton.classList.add("is-current");
      const mobileMenu = originalMenu.cloneNode(true);
      mobileMenu.hidden = true;
      moreWrap.append(mobileButton,mobileMenu);
      mobileNav.append(moreWrap);
      document.body.appendChild(mobileNav);
      // Never suppress the original navigation when scripts are unavailable.
      document.body.classList.add("pw-has-mobile-nav");
      buttons.push(mobileButton);
    }
  }

  function groupMenu(menu, menuIndex) {
    if (menu.querySelector(".nav-menu-group")) return;
    // Make the dedicated network directory available throughout the website.
    // Keep this idempotent for pages that already include the link in HTML.
    let networksLink = menu.querySelector('a[href="networks.html"]');
    if (!networksLink) {
      networksLink = document.createElement("a");
      networksLink.href = "networks.html";
      networksLink.textContent = "Other Networks";
      networksLink.setAttribute("role", "menuitem");
      const stationLink = menu.querySelector('a[href="station.html"]');
      if (stationLink) stationLink.after(networksLink);
      else menu.appendChild(networksLink);
    }
    networksLink.textContent = "Other Networks";
    if (window.location.pathname.endsWith("/networks.html")) {
      networksLink.classList.add("active");
      networksLink.setAttribute("aria-current", "page");
    }
    // One Reports destination in the site menu; both legacy URLs stay reachable.
    const reportLink = menu.querySelector('a[href="monthly.html"]');
    const annualLink = menu.querySelector('a[href="annual.html"]');
    if (reportLink) {
      reportLink.textContent = "Weather reports";
      if (/\/(?:monthly|annual)\.html$/.test(window.location.pathname)) {
        reportLink.classList.add("active");
        reportLink.setAttribute("aria-current", "page");
      }
      annualLink?.remove();
    }
    const links = [...menu.querySelectorAll(":scope > a")];
    const explore = new Set(["climate.html","station.html","networks.html","coast.html","sky.html","records.html","history.html"]);
    const reports = new Set(["summary.html","monthly.html","annual.html","downloads.html"]);
    const groups = [
      ["Explore", links.filter(link => explore.has(link.getAttribute("href")))],
      ["Reports", links.filter(link => reports.has(link.getAttribute("href")))],
      ["Site & app", links.filter(link => !explore.has(link.getAttribute("href")) && !reports.has(link.getAttribute("href")))]
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
