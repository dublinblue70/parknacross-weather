(() => {
  "use strict";

  const buttons = [...document.querySelectorAll(".nav-more-button")];
  if (!buttons.length) return;

  let repositionFrame = 0;

  function menuFor(button) {
    return button.parentElement?.querySelector(".nav-more-menu") || null;
  }

  function closeOne(button) {
    const menu = menuFor(button);
    if (menu) {
      menu.hidden = true;
      menu.style.visibility = "";
    }
    button.setAttribute("aria-expanded", "false");
  }

  function closeAll(except = null) {
    buttons.forEach(button => {
      if (button !== except) closeOne(button);
    });
  }

  function viewportBox() {
    // iOS Safari's visual viewport can be smaller/offset from the layout
    // viewport when the URL bar or keyboard changes. Position against the
    // visual viewport when available so the menu stays on screen.
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

    // Force layout only after the final width is known.
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

      positionMenu(button, menu);
      button.setAttribute("aria-expanded", "true");

      // Do not move focus after a finger tap. On iPhone/iPad Safari that focus
      // operation can move the visual viewport, fire a scroll event and make
      // the dropdown appear to close immediately. Keyboard activation has
      // event.detail === 0, so retain useful keyboard focus in that case only.
      if (event.detail === 0) {
        const first = menu.querySelector("a");
        try { first?.focus({ preventScroll: true }); }
        catch (_) { first?.focus(); }
      }
    });

    // Prevent a tap inside the fixed dropdown being treated as an outside tap
    // by Safari while the visual viewport is settling.
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
    if (!(target instanceof Element) || !target.closest(".nav-more")) closeAll();
  });

  // Reposition instead of closing. Mobile Safari can emit resize/scroll events
  // simply because its browser chrome expands/collapses after a tap.
  window.addEventListener("resize", repositionOpenMenus, { passive: true });
  window.addEventListener("scroll", repositionOpenMenus, { passive: true });
  window.addEventListener("orientationchange", repositionOpenMenus, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", repositionOpenMenus, { passive: true });
    window.visualViewport.addEventListener("scroll", repositionOpenMenus, { passive: true });
  }
})();
