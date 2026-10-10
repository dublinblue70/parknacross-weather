(() => {
  'use strict';
  // Match the System Status page: fresh <10 min, delayed <30 min, then stale.
  function feedState(date, requestOK, now = Date.now()) {
    if (!requestOK) return {label:'Unavailable', tone:'bad'};
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return {label:'Time unavailable', tone:'warn'};
    const age = (now - date.getTime()) / 1000;
    if (age < -120) return {label:'Check timestamp', tone:'warn'};
    if (age < 600) return {label:'Live', tone:'ok'};
    if (age < 1800) return {label:'Delayed', tone:'warn'};
    return {label:'Stale', tone:'bad'};
  }
  window.ParknacrossStation = {feedState};
  const sensors = {
    array: {title:'Roof-mounted weather array',copy:'The WS90 measures outdoor air temperature, relative humidity, wind speed and direction, rainfall, solar radiation and UV. Wind is measured ultrasonically, with no rotating cups; rainfall uses a piezoelectric sensor.',href:'graphs.html',link:'Explore weather charts →'},
    lightning: {title:'Nearby lightning detector',copy:'The WH57 reports lightning detections and estimates their distance, with an approximate range up to 40 km. Distances are estimates and a zero count does not rule out lightning in the area.',href:'graphs.html#lightning',link:'Explore lightning charts →'},
    soil: {title:'Garden soil sensor',copy:'The WH52 measures moisture, root-zone temperature and electrical conductivity at its own planting location. These readings describe that spot, rather than every pot or bed in the garden.',href:'graphs.html#soilMoistureCard',link:'Explore soil charts →'},
    gateway: {title:'The connection indoors',copy:'The GW3001 receives wireless observations from the outdoor sensors and sends them to the weather data service. It also provides the barometric-pressure reading. The website refreshes about every minute and archives observations at roughly five-minute intervals.',href:'status.html',link:'Check data and sensor status →'}
  };
  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const buttons = [...document.querySelectorAll('[data-sensor]')];
    function showSensor(key) {
      const sensor = sensors[key]; if (!sensor) return;
      $('stationSensorTitle').textContent = sensor.title;
      $('stationSensorCopy').textContent = sensor.copy;
      $('stationSensorLink').textContent = sensor.link;
      $('stationSensorLink').href = sensor.href;
      buttons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.sensor === key)));
      document.querySelector('.station-schematic')?.setAttribute('data-active-sensor',key);
    }
    for (const button of buttons) {
      for (const event of ['pointerenter','focus','click']) button.addEventListener(event,() => showSensor(button.dataset.sensor));
    }
    if (buttons.length) showSensor('array');
    const host = $('stationMaintenancePreview');
    if (host) {
      host.replaceChildren();
      const rows = Array.isArray(window.PARKNACROSS_MAINTENANCE_LOG) ? [...window.PARKNACROSS_MAINTENANCE_LOG] : [];
      rows.sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
      for (const item of rows.slice(0,3)) {
        const article = document.createElement('article');
        const time = document.createElement('time'); time.dateTime = item.date || '';
        const exact = /^\d{4}-\d{2}-\d{2}$/.test(item.date || '');
        const monthly = /^\d{4}-\d{2}$/.test(item.date || '');
        time.textContent = exact || monthly ? new Date(`${item.date}${monthly?'-15':''}T12:00:00Z`).toLocaleDateString('en-IE',{day:exact?'numeric':undefined,month:'short',year:'numeric',timeZone:'Europe/Dublin'}) : item.date || 'Date not recorded';
        const type = document.createElement('span'); type.className = 'station-entry-type'; type.textContent = item.type || 'Station';
        const title = document.createElement('h3'); title.textContent = item.title || 'Station update';
        const link = document.createElement('a'); link.href = 'maintenance.html'; link.textContent = 'Read log entry →';
        article.append(time,type,title,link); host.append(article);
      }
      if (!rows.length) host.textContent = 'No maintenance entries have been recorded yet.';
    }
    // Keep both freshness displays in agreement as a reading ages between requests.
    function syncQualityFreshness() {
      const badge = $('stationFeed');
      if (badge && /^(Live|Delayed|Stale|Unavailable|Check timestamp)$/.test(badge.textContent)) {
        if ($('qualityFeed')) $('qualityFeed').textContent = badge.textContent;
        if ($('qualityAge')) $('qualityAge').textContent = $('stationLastUpdatedRelative')?.textContent || 'Observation time unavailable';
      }
    }
    document.addEventListener('station-feed-updated',syncQualityFreshness);
  });
})();
