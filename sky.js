(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const c = window.PARKNACROSS_CONFIG || {};
    const $ = id => document.getElementById(id);
    $("year").textContent = new Date().getFullYear();
    const panel = $("skyPanel");

    if (c.skycamImageUrl && panel) {
      $("skyPlaceholder").hidden = true;
      const image = document.createElement("img");
      image.id = "skyImage";
      image.className = "sky-image";
      image.alt = "Live view from the Parknacross sky camera";
      panel.appendChild(image);
      const refresh = () => {
        image.src = c.skycamImageUrl + (c.skycamImageUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
      };
      refresh();
      setInterval(refresh, 300000);
    }

    if (c.skycamTimelapseUrl && panel) {
      const video = document.createElement("a");
      video.id = "skyVideo";
      video.className = "primary-button";
      video.target = "_blank";
      video.rel = "noopener noreferrer";
      video.href = c.skycamTimelapseUrl;
      video.textContent = "Watch today's timelapse";
      panel.appendChild(video);
    }
  });
})();
