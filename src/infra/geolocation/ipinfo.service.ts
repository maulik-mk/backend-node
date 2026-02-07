import env from '#config/env.js';

export interface GeoData {
   city?: string;
   region?: string;
   country?: string;
   locationString?: string;
   latitude?: number;
   longitude?: number;
}

interface IpInfoResponse {
   city?: string;
   region?: string;
   country?: string;
   loc?: string;
}

export const getGeoLocation = async (ip: string): Promise<GeoData> => {
   let resolvedIp = ip;
   if (env.NODE_ENV === 'development') {
      resolvedIp = '103.21.164.0';
   }

   if (!env.IPINFO_TOKEN) return { locationString: 'Localhost / Unknown' };

   try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
         controller.abort();
      }, 2000);

      const res = await fetch(`https://ipinfo.io/${resolvedIp}?token=${env.IPINFO_TOKEN}`, {
         signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return { locationString: 'Unknown Location' };

      const data = (await res.json()) as IpInfoResponse;
      const locationString = [data.city, data.region, data.country].filter(Boolean).join(', ');

      const [lat, lng] = (data.loc ?? '').split(',');

      return {
         city: data.city,
         region: data.region,
         country: data.country,
         locationString: locationString || 'Unknown Location',
         latitude: lat ? parseFloat(lat) : undefined,
         longitude: lng ? parseFloat(lng) : undefined,
      };
   } catch {
      return { locationString: 'Unknown Location' };
   }
};
