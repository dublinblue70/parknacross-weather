/* Rain intensity categories for measured WH40H rain rate only.
 * mm/h bands are site display conventions; "drizzle" is a droplet type and
 * cannot be diagnosed from rate alone. Never classify an unverified WS90 piezo
 * reading as observed rainfall.
 */
(() => {
  "use strict";
  function validRate(rate) {
    if (rate === null || rate === undefined || rate === "" || !Number.isFinite(Number(rate))) return null;
    const value = Number(rate);
    return value >= 0 && value <= 500 ? value : null;
  }
  function classify(rate) {
    const value = validRate(rate);
    if (value === null) return { label: "Rain rate unavailable", level: "unavailable", confirmed: false };
    if (value === 0) return { label: "No rain measured now", level: "none", confirmed: false };
    if (value <= 0.5) return { label: "Very light rain", level: "very-light", confirmed: true };
    if (value <= 2.5) return { label: "Light rain", level: "light", confirmed: true };
    if (value <= 7.5) return { label: "Moderate rain", level: "moderate", confirmed: true };
    if (value <= 15) return { label: "Heavy rain", level: "heavy", confirmed: true };
    if (value <= 30) return { label: "Very heavy rain", level: "very-heavy", confirmed: true };
    return { label: "Torrential rain", level: "torrential", confirmed: true };
  }
  function formatRate(rate) {
    const value = validRate(rate);
    if (value === null) return "Unavailable";
    if (value > 0 && value < 0.1) return "<0.1 mm/h";
    return value.toFixed(1) + " mm/h";
  }
  window.ParknacrossRainIntensity = Object.freeze({ classify, formatRate });
})();
