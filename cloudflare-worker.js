/**
 * Cloudflare Worker template for Parknacross Weather
 *
 * Store the following as Worker secrets/environment variables:
 * ECOWITT_APP_KEY
 * ECOWITT_API_KEY
 * ECOWITT_MAC
 *
 * IMPORTANT:
 * Ecowitt's API response structure can vary depending on the endpoint,
 * sensor configuration and units requested. This Worker is therefore a
 * starter template. Once your GW3001 is connected and you have your API
 * details, map the returned Ecowitt fields below.
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const params = new URLSearchParams({
      application_key: env.ECOWITT_APP_KEY,
      api_key: env.ECOWITT_API_KEY,
      mac: env.ECOWITT_MAC,
      call_back: "all"
    });

    const url = `https://api.ecowitt.net/api/v3/device/real_time?${params.toString()}`;

    try {
      const ecowittResponse = await fetch(url);
      const raw = await ecowittResponse.json();

      // Map your exact Ecowitt fields here after we inspect your live response.
      const weather = {
        temperature: null,
        feelsLike: null,
        humidity: null,
        pressure: null,
        windSpeed: null,
        windDirection: null,
        windGust: null,
        rainfall: null,
        uv: null,
        solar: null,
        updated: new Date().toISOString(),
        raw
      };

      return new Response(JSON.stringify(weather), {
        headers: corsHeaders
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: "Unable to retrieve Ecowitt data",
        detail: String(error)
      }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};
