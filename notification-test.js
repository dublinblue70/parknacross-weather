/* A manual local notification check. This does not test background push delivery. */
(() => {
  "use strict";
  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("alertsTestButton");
    const status = document.getElementById("alertsTestStatus");
    if (!button || !status) return;

    const report = text => { status.textContent = text; };
    button.addEventListener("click", async () => {
      if (!("Notification" in window)) {
        report("This browser does not support device notifications.");
        return;
      }
      if (Notification.permission !== "granted") {
        report("Enable notification permission first, then try the test again.");
        return;
      }
      button.disabled = true;
      report("Requesting a test notification on this device…");
      try {
        const registration = "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration()
          : null;
        if (registration && typeof registration.showNotification === "function") {
          await registration.showNotification("Parknacross Weather — test", {
            body: "Notifications can be displayed on this device.",
            tag: "parknacross-local-notification-test",
            icon: "./icon-192.png"
          });
          report("Test notification requested. This verifies local display only, not background push delivery.");
        } else if (typeof Notification === "function") {
          new Notification("Parknacross Weather — test", {
            body: "Notifications can be displayed on this device."
          });
          report("Test notification requested. Background delivery is not verified.");
        } else {
          report("Install or open the site as a supported web app to test device notifications.");
        }
      } catch (error) {
        console.warn("Local weather notification test:", error);
        report("The browser could not display the test notification. Check its site permissions.");
      } finally {
        button.disabled = false;
      }
    });
  });
})();
