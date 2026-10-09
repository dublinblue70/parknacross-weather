(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const apiHost = new URL(window.PARKNACROSS_CONFIG?.apiBase || 'https://parknacross-weather.dave-s-carter.workers.dev').host;
  async function boundedFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.host !== apiHost && url.host !== 'api.rainviewer.com') return nativeFetch(input, init);
    // Rolling archives must refresh within the station's five-minute interval.
    // Share a stable bucket across visitors instead of bypassing cache on every request.
    let requestInput = input;
    if (url.host === apiHost && url.pathname === '/history' && !url.searchParams.has('from_epoch') && !url.searchParams.has('to_epoch')) {
      url.searchParams.set('_window', String(Math.floor(Date.now() / 300000)));
      requestInput = typeof input === 'string' || input instanceof URL ? url.href : new Request(url.href, input);
    }
    const controller = new AbortController();
    const external = init.signal || (typeof input !== 'string' ? input.signal : null);
    const abort = () => controller.abort(external?.reason);
    if (external?.aborted) abort();
    else external?.addEventListener('abort', abort, {once:true});
    const timeout = /^\/export(?:\.csv)?$/.test(url.pathname) ? 60000 : 20000;
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await nativeFetch(requestInput, {...init, signal:controller.signal});
          if ([204,205,304].includes(response.status)) return response;
          // Include the response body in the deadline, not just its headers.
          const body = await response.arrayBuffer();
          return new Response(body, {status:response.status, statusText:response.statusText, headers:response.headers});
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => {
          controller.abort();
          reject(new Error('The weather service took too long to respond. Please retry.'));
        }, timeout); })
      ]);
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
    }
  }
  window.fetch = boundedFetch;
  window.ParknacrossRequest = {fetch:boundedFetch};
})();
