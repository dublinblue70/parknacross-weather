(() => {
  'use strict';
  const panel = document.getElementById('socialAdminPanel');
  if (!panel || new URLSearchParams(location.search).get('admin') !== '1') return;
  panel.hidden = false;
  const $ = id => document.getElementById(id);
  const previewDetails = $('socialAdminPreview');
  const base = (window.PARKNACROSS_CONFIG?.apiBase || 'https://parknacross-weather.dave-s-carter.workers.dev').replace(/\/$/, '');
  let statusBusy = false, previewBusy = false, lastStatus = null, noticeSent = '';
  const stored = key => { try { return sessionStorage.getItem(key) || ''; } catch (_) { return ''; } };
  function credential(ask = false) {
    let key = stored('parknacrossAdminKey');
    if (!key && ask) key = window.prompt('Enter the Parknacross admin key') || '';
    return key;
  }
  async function request(path, key) {
    const response = await fetch(`${base}${path}`, {headers:{'X-Parknacross-Admin-Key':key},cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error(response.status === 401 ? 'Admin key was not accepted.' : 'Posting details are unavailable. Check that the updated Worker has been deployed.');
    const data = await response.json();
    try { sessionStorage.setItem('parknacrossAdminKey',key); } catch (_) {}
    return data;
  }
  function safePostLink(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && /(^|\.)(facebook\.com|x\.com|twitter\.com|t\.co)$/.test(u.hostname) ? u.href : null; } catch (_) { return null; }
  }
  function renderStatus(data) {
    lastStatus = data;
    const container = $('socialAdminNetworks'); container.replaceChildren();
    for (const [name,label] of [['facebook','Facebook'],['x','X']]) {
      const state = data.networks?.[name] || {label:'Status unavailable',state:'unknown'};
      const card = document.createElement('div');card.dataset.state = state.state;
      const title = document.createElement('strong'); title.textContent = label; card.append(title);
      const message = document.createElement('p');message.textContent = state.label;card.append(message);
      if (state.error) { const error = document.createElement('p');error.textContent = String(state.error).slice(0,400);card.append(error); }
      const href = safePostLink(state.public_url);
      if (href) { const link = document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View published post';card.append(link); }
      if (state.text) $(name === 'facebook' ? 'socialAdminFacebookText' : 'socialAdminXText').textContent = state.text;
      container.append(card);
    }
    const notice = $('socialAdminNotice');notice.hidden = !data.notice;notice.textContent = data.notice?.message || '';
    $('socialAdminResult').textContent = `Checked ${new Date(data.checked_at).toLocaleTimeString('en-IE',{timeZone:'Europe/Dublin',hour:'2-digit',minute:'2-digit'})} · ${data.day}`;
    if (data.notice && data.notice.key !== noticeSent && 'Notification' in window && Notification.permission === 'granted') {
      try {
        if (localStorage.getItem('parknacrossSocialDeviceNotices') === 'enabled') {
          new Notification('Parknacross daily posts need attention',{body:data.notice.message,tag:`parknacross-social-${data.day}`});
          noticeSent = data.notice.key;
        }
      } catch (_) { /* The visible notice remains available. */ }
    }
  }
  async function refreshStatus(ask = false) {
    if (statusBusy || document.hidden) return;
    const key = credential(ask); if (!key) return;
    statusBusy = true;
    try { renderStatus(await request('/social-dashboard',key)); }
    catch (error) { $('socialAdminResult').textContent = error.message; }
    finally { statusBusy = false; }
  }
  async function refreshPreview(ask = false) {
    if (previewBusy) return;
    const key = credential(ask); if (!key) return;
    previewBusy = true;
    $('socialAdminPreviewNote').textContent = 'Loading today’s post preview…';
    try {
      const preview = await request('/social-preview-today',key);
      $('socialAdminFacebookText').textContent = lastStatus?.networks?.facebook?.text || preview.facebookText || '';
      $('socialAdminXText').textContent = lastStatus?.networks?.x?.text || preview.xText || '';
      const stale = preview.observation_age_minutes > 45;
      const when = preview.observation?.epoch ? new Date(preview.observation.epoch*1000).toLocaleString('en-IE',{timeZone:'Europe/Dublin'}) : 'time unavailable';
      $('socialAdminPreviewNote').textContent = `Published text is shown where recorded. Otherwise this is a preview using the observation from ${when}; readings and the available photo are refreshed when publishing.${stale ? ' These readings are old: the preview does not bypass the publishing freshness checks.' : ''}`;
      const photo = $('socialAdminPhoto');
      const imageUrl = preview.photo?.url || null;
      photo.hidden = !imageUrl;
      if (imageUrl) photo.src = imageUrl; else photo.removeAttribute('src');
      $('socialAdminPhotoNote').textContent = imageUrl ? 'Today’s sky photo is available for the next post.' : 'No current-day sky photo is available. The post will publish as text only.';
    } catch (error) { $('socialAdminPreviewNote').textContent = error.message; }
    finally { previewBusy = false; }
  }
  $('socialAdminPhoto')?.addEventListener('error',()=>{ $('socialAdminPhoto').hidden=true; $('socialAdminPhotoNote').textContent='Photo preview could not load; posting falls back to text if the image is unavailable.'; });
  $('socialAdminRefresh')?.addEventListener('click',async()=>{
    const key = credential(true); if (!key) return;
    try { sessionStorage.setItem('parknacrossAdminKey',key); } catch (_) {}
    if (previewDetails) previewDetails.open = true;
    await refreshStatus(); await refreshPreview();
  });
  previewDetails?.addEventListener('toggle',()=>{
    if (previewDetails.open) refreshPreview();
  });
  const notifyButton = $('socialAdminNotify');
  if (!('Notification' in window)) notifyButton.hidden = true;
  else notifyButton.addEventListener('click',async()=>{
    try {
      const enabled = localStorage.getItem('parknacrossSocialDeviceNotices') === 'enabled';
      if (enabled) { localStorage.removeItem('parknacrossSocialDeviceNotices'); notifyButton.textContent='Enable notices on this device'; return; }
      const permission = await Notification.requestPermission();
      if (permission === 'granted') { localStorage.setItem('parknacrossSocialDeviceNotices','enabled'); notifyButton.textContent='Disable notices on this device'; await refreshStatus(); }
      else $('socialAdminResult').textContent='Device notices were not enabled. Posting notices remain visible in this panel.';
    } catch (_) { $('socialAdminResult').textContent='Posting notices remain visible in this panel.'; }
  });
  try { if (localStorage.getItem('parknacrossSocialDeviceNotices') === 'enabled') notifyButton.textContent='Disable notices on this device'; } catch (_) {}
  async function refreshAll() {
    await refreshStatus();
    await refreshPreview();
  }
  refreshAll();
  setInterval(()=>refreshStatus(),60000);
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) refreshAll();});
})();
