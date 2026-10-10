/* Public API routing. No credentials belong here.
 * Set customBase only after the existing Worker is connected to the hostname
 * and /health, /current and CORS have been verified. Keep the fallback active.
 */
window.PARKNACROSS_API_ROUTING = {
  customBase: '', // Planned hostname: https://api.parknacrossweather.ie
  fallbackBase: 'https://parknacross-weather.dave-s-carter.workers.dev'
};
window.PARKNACROSS_API_BASE = window.PARKNACROSS_API_ROUTING.customBase || window.PARKNACROSS_API_ROUTING.fallbackBase;
document.addEventListener('DOMContentLoaded', () => {
  // Static CSV links must follow the same route as charts and live readings.
  const routing=window.PARKNACROSS_API_ROUTING;
  if(!routing.customBase)return;
  for(const link of document.querySelectorAll('a[href]')){
    if(link.href.startsWith(routing.fallbackBase+'/'))link.href=routing.customBase+link.href.slice(routing.fallbackBase.length);
  }
});
