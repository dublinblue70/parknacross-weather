(() => {
  "use strict";

  const buttons = [...document.querySelectorAll(".nav-more-button")];
  if (!buttons.length) return;

  const menuState = new Map();
  let repositionFrame = 0;

  for (const button of buttons) {
    const wrapper = button.parentElement;
    const menu = wrapper?.querySelector(".nav-more-menu") || null;
    if (!menu || !wrapper) continue;
    menuState.set(button, { menu, wrapper, nextSibling: menu.nextSibling });
  }

  function menuFor(button) {
    return menuState.get(button)?.menu || null;
  }

  function restoreMenu(button) {
    const state = menuState.get(button);
    if (!state) return;
    const { menu, wrapper, nextSibling } = state;
    if (menu.parentElement === wrapper) return;
    if (nextSibling && nextSibling.parentElement === wrapper) {
      wrapper.insertBefore(menu, nextSibling);
    } else {
      wrapper.appendChild(menu);
    }
  }

  function portalMenu(button) {
    const menu = menuFor(button);
    if (!menu) return null;
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
    return menu;
  }

  function closeOne(button) {
    const menu = menuFor(button);
    if (menu) {
      menu.hidden = true;
      menu.style.visibility = "";
      menu.style.left = "";
      menu.style.top = "";
      menu.style.width = "";
      menu.style.maxHeight = "";
      menu.style.overflowY = "";
      restoreMenu(button);
    }
    button.setAttribute("aria-expanded", "false");
  }

  function closeAll(except = null) {
    buttons.forEach(button => {
      if (button !== except) closeOne(button);
    });
  }

  function viewportBox() {
    const vv = window.visualViewport;
    return {
      left: vv ? vv.offsetLeft : 0,
      top: vv ? vv.offsetTop : 0,
      width: vv ? vv.width : window.innerWidth,
      height: vv ? vv.height : window.innerHeight
    };
  }

  function positionMenu(button, menu) {
    const edge = 8;
    const gap = 8;
    const viewport = viewportBox();

    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.maxHeight = "none";
    menu.style.overflowY = "visible";

    const rect = button.getBoundingClientRect();
    const width = Math.min(340, Math.max(260, viewport.width - edge * 2));
    menu.style.width = `${width}px`;

    const minLeft = viewport.left + edge;
    const maxLeft = viewport.left + viewport.width - width - edge;
    const preferredLeft = rect.right - width;
    menu.style.left = `${Math.max(minLeft, Math.min(maxLeft, preferredLeft))}px`;

    const naturalHeight = Math.max(1, menu.scrollHeight || menu.offsetHeight || 190);
    const viewportBottom = viewport.top + viewport.height;
    const spaceBelow = Math.max(0, viewportBottom - rect.bottom - gap - edge);
    const spaceAbove = Math.max(0, rect.top - viewport.top - gap - edge);
    const openBelow = spaceBelow >= naturalHeight || spaceBelow >= spaceAbove;
    const available = Math.max(120, openBelow ? spaceBelow : spaceAbove);
    const renderedHeight = Math.min(naturalHeight, available);

    menu.style.maxHeight = `${renderedHeight}px`;
    menu.style.overflowY = naturalHeight > renderedHeight ? "auto" : "visible";

    const top = openBelow
      ? Math.min(viewportBottom - renderedHeight - edge, rect.bottom + gap)
      : Math.max(viewport.top + edge, rect.top - gap - renderedHeight);
    menu.style.top = `${top}px`;
    menu.style.visibility = "visible";
  }

  function repositionOpenMenus() {
    if (repositionFrame) return;
    repositionFrame = requestAnimationFrame(() => {
      repositionFrame = 0;
      buttons.forEach(button => {
        if (button.getAttribute("aria-expanded") !== "true") return;
        const menu = menuFor(button);
        if (menu && !menu.hidden) positionMenu(button, menu);
      });
    });
  }

  buttons.forEach(button => {
    const menu = menuFor(button);
    if (!menu) return;

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const opening = menu.hidden || button.getAttribute("aria-expanded") !== "true";
      closeAll(opening ? button : null);

      if (!opening) {
        closeOne(button);
        return;
      }

      // Safari/WebKit treats a backdrop-filter ancestor as a containing block
      // for fixed descendants. Move the open menu to <body> so it is truly
      // viewport-fixed and cannot be clipped by the blurred/overflowing shell.
      const portalled = portalMenu(button);
      if (!portalled) return;

      positionMenu(button, portalled);
      button.setAttribute("aria-expanded", "true");

      // Retain keyboard focus behaviour without forcing a visual-viewport
      // change after touch activation on iPhone/iPad Safari.
      if (event.detail === 0) {
        const first = portalled.querySelector("a");
        try { first?.focus({ preventScroll: true }); }
        catch (_) { first?.focus(); }
      }
    });

    menu.addEventListener("click", event => event.stopPropagation());
    menu.addEventListener("touchstart", event => event.stopPropagation(), { passive: true });

    menu.addEventListener("keydown", event => {
      const items = [...menu.querySelectorAll("a")];
      const index = items.indexOf(document.activeElement);

      if (event.key === "Escape") {
        event.preventDefault();
        closeOne(button);
        button.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        items[(index + 1 + items.length) % items.length]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
      }
    });
  });

  document.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const clickedOpenMenu = [...menuState.values()].some(({ menu }) => menu.contains(target));
    if (!target.closest(".nav-more") && !clickedOpenMenu) closeAll();
  });

  window.addEventListener("resize", repositionOpenMenus, { passive: true });
  window.addEventListener("scroll", repositionOpenMenus, { passive: true });
  window.addEventListener("orientationchange", repositionOpenMenus, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", repositionOpenMenus, { passive: true });
    window.visualViewport.addEventListener("scroll", repositionOpenMenus, { passive: true });
  }
})();
