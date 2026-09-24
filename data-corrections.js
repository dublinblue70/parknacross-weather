(() => {
  "use strict";

  /*
   * One public source of truth for documented archive corrections. Ideally
   * these corrections will eventually be applied by the archive API itself;
   * keeping them here prevents individual pages from drifting in the interim.
   */
  const dailyRainMm = Object.freeze({
    "2026-09-11": 0.1 // Commissioning test, not rainfall.
  });

  window.PARKNACROSS_DATA_CORRECTIONS = Object.freeze({ dailyRainMm });
})();
