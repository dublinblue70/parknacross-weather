(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const apiHost = new URL(window.PARKNACROSS_CONFIG?.apiBase || 'https://parknacross-weather.dave-s-carter.workers.dev').host;
  async function boundedFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    const routing=window.PARKNACROSS_API_ROUTING;
    const primary=routing?.customBase;
    const fallback=routing?.fallbackBase;
    const primaryHost=primary?new URL(primary).host:null;
    const fallbackHost=fallback?new URL(fallback).host:null;
    const isApi=[apiHost,primaryHost,fallbackHost].includes(url.host);
    if (!isApi && url.host !== 'api.rainviewer.com') return nativeFetch(input, init);
    // Rolling archives must refresh within the station's five-minute interval.
    // Share a stable bucket across visitors instead of bypassing cache on every request.
    let requestInput = input;
    if(primary && isApi){
      url.host=primaryHost;
      url.protocol='https:';
      requestInput=typeof input==='string'||input instanceof URL?url.href:new Request(url.href,input);
    }
    if (isApi && url.pathname === '/history' && !url.searchParams.has('from_epoch') && !url.searchParams.has('to_epoch')) {
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
          // Retry only reads on the existing service. Never replay a write or
          // mistake authentication/validation errors for a routing outage.
          const method=String(init.method || (typeof input==='object'?input.method:null) || 'GET').toUpperCase();
          const canFallback=Boolean(primary&&fallback&&isApi&&primary!==fallback&&method==='GET');
          let response;
          try{
            response=await nativeFetch(requestInput,{...init,signal:controller.signal});
            if(canFallback&&response.status>=500&&!controller.signal.aborted){
              const alternative=new URL(url.href);alternative.host=fallbackHost;
              response=await nativeFetch(typeof input==='string'||input instanceof URL?alternative.href:new Request(alternative.href,input),{...init,signal:controller.signal});
            }
          }catch(error){
            if(!canFallback||controller.signal.aborted)throw error;
            const alternative=new URL(url.href);alternative.host=fallbackHost;
            response=await nativeFetch(typeof input==='string'||input instanceof URL?alternative.href:new Request(alternative.href,input),{...init,signal:controller.signal});
          }
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
