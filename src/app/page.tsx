"use client";

import { useEffect, useState } from "react";

type MarketData = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdated: Date;
};

type WeatherData = {
  temperature: number;
  condition: string;
  tempHigh: number;
  tempLow: number;
  feelsLike: number;
  lastUpdated: Date;
};

type RefreshSchedule = {
  nextAutoRefresh: Date | null;
};

export default function HomePage() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState<Date | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState<string>("");

  const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  // Note: For production, set NEXT_PUBLIC_FINNHUB_API_KEY in Vercel env

  const SYMBOLS = ["GLDM", "SLVR", "SILJ", "CAPR", "SPY", "QQQ", "BTC", "TRX", "SOL"];

  // Auto-refresh at 6am and 12pm local time
  useEffect(() => {
    const scheduleNextRefresh = () => {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000; // local to UTC in ms
      const local = new Date(now.getTime() - tzOffset);

      // Build dates for today at 6am and 12pm in local time
      const sixAM = new Date(local);
      sixAM.setHours(6, 0, 0, 0);
      const twelvePM = new Date(local);
      twelvePM.setHours(12, 0, 0, 0);

      // Convert back to UTC for comparison
      const sixAM_utc = new Date(sixAM.getTime() + tzOffset);
      const twelvePM_utc = new Date(twelvePM.getTime() + tzOffset);

      const candidates = [sixAM_utc, twelvePM_utc].filter(d => d > now);
      const next = candidates[0];

      if (next) {
        setRefreshCountdown(`Next auto-refresh in ${Math.round((next.getTime() - now.getTime()) / 60000)} minutes`);
      } else {
        // Both times passed today; schedule for 6am tomorrow
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(6, 0, 0, 0);
        setRefreshCountdown(`Next auto-refresh in ${Math.round((tomorrow.getTime() - now.getTime()) / 60000)} minutes`);
      }
    };

    scheduleNextRefresh();
    const interval = setInterval(scheduleNextRefresh, 60_000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch weather (Open-Meteo for Charlotte, NC)
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=35.2271&longitude=-80.8431&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&forecast_days=1`
      );
      if (!weatherRes.ok) throw new Error("Weather fetch failed");
      const weatherJson = await weatherRes.json();

      const current = weatherJson.current_weather;
      const daily = weatherJson.daily;
      setWeather({
        temperature: Math.round(current.temperature),
        condition: mapWMOToCondition(current.weathercode),
        tempHigh: Math.round(daily.temperature_2m_max[0]),
        tempLow: Math.round(daily.temperature_2m_min[0]),
        feelsLike: Math.round(current.temperature + (windChillAdjustment(current.temperature, current.windspeed) || 0)), // approximate
        lastUpdated: new Date(),
      });

      // 2. Fetch Finnhub stock/ETF quotes (if API key provided)
      const marketPromises: Promise<MarketData | null>[] = SYMBOLS.map(async (symbol) => {
        const isCrypto = ["BTC", "TRX", "SOL"].includes(symbol);
        let endpoint: string;
        if (isCrypto) {
          // CoinGecko for crypto (no API key)
          const idMap: Record<string, string> = {
            BTC: "bitcoin",
            TRX: "tron",
            SOL: "solana",
          };
          endpoint = `https://api.coingecko.com/api/v3/simple/price?ids=${idMap[symbol]}&vs_currencies=usd&include_24hr_change=true`;
        } else if (FINNHUB_API_KEY) {
          endpoint = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
        } else {
          // No API key, skip Finnhub symbols for now
          return null;
        }

        const res = await fetch(endpoint, { next: { revalidate: 0 } });
        if (!res.ok) return null;
        const data = await res.json();

        if (isCrypto) {
          return {
            symbol,
            price: data[idMap[symbol]].usd,
            change: data[idMap[symbol]].usd_24h_change,
            changePercent: data[idMap[symbol]].usd_24h_change,
            lastUpdated: new Date(),
          };
        } else {
          const change = data.c - data.pc;
          const changePercent = ((change / data.pc) * 100);
          return {
            symbol,
            price: data.c,
            change,
            changePercent,
            lastUpdated: new Date(),
          };
        }
      });

      const results = await Promise.all(marketPromises);
      setMarkets(results.filter((m): m is MarketData => m !== null));

      setLastGlobalUpdate(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchData();
    // Then schedule client-side refresh at 6am and 12pm local
    const checkAndRefreshAtTimes = () => {
      const now = new Date();
      const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
      const hours = local.getHours();
      const minutes = local.getMinutes();

      if ((hours === 6 || hours === 12) && minutes === 0) {
        fetchData();
      }
    };

    const interval = setInterval(checkAndRefreshAtTimes, 60000); // check every minute
    return () => clearInterval(interval);
  }, [FINNHUB_API_KEY]);

  const handleManualRefresh = () => {
    fetchData();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-black p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-2 pb-6 border-b border-gray-200">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
            Good morning, Ben
          </h1>
          <p className="text-lg text-gray-500">
            {formatDate(lastGlobalUpdate || new Date())}
          </p>
          {weather && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-gray-200 mt-2">
              <span className="text-2xl">{weather.temperature}°F</span>
              <span className="text-gray-600">{weather.condition}</span>
              <span className="text-gray-500">|</span>
              <span className="text-gray-600">H:{weather.tempHigh}° L:{weather.tempLow}°</span>
              <span className="text-gray-500">|</span>
              <span className="text-gray-600">Feels like {weather.feelsLike}°F</span>
            </div>
          )}
        </header>

        {/* Manual Refresh Bar */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-500">
            {loading ? "Updating..." : `Last updated: ${lastGlobalUpdate ? formatTime(lastGlobalUpdate) : "Never"}`}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{refreshCountdown}</span>
            <button
              onClick={handleManualRefresh}
              disabled={loading}
              className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition"
            >
              Refresh now
            </button>
          </div>
        </div>

        {/* Markets Grid */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-gray-900">Markets Snapshot</h2>
          {loading && markets.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-32 bg-white rounded-2xl animate-pulse border border-gray-200" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {markets.map((m) => (
                <div
                  key={m.symbol}
                  className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition"
                >
                  <div className="text-sm font-medium text-gray-500 mb-1">{m.symbol}</div>
                  <div className="text-2xl font-semibold text-gray-900">${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className={`text-sm mt-1 ${m.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {m.changePercent >= 0 ? "+" : ""}
                    {m.changePercent.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Updated {m.lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
            Error: {error}. {FINNHUB_API_KEY ? "" : "Missing Finnhub API key. Set NEXT_PUBLIC_FINNHUB_API_KEY."}
          </div>
        )}
      </div>
    </div>
  );
}

// Simple mapping from WMO weather codes to human-readable conditions
function mapWMOToCondition(code: number): string {
  const map: Record<number, string> = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy rain showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
  };
  return map[code] || "Unknown";
}

// Approximate wind chill adjustment if feels_like not provided
function windChillAdjustment(tempF: number, windSpeedKph: number): number | null {
  if (tempF > 50) return 0;
  const windSpeedMph = windSpeedKph * 0.621371;
  const t = tempF;
  const v = windSpeedMph;
  const chill = 35.74 + 0.6215 * t - 35.75 * Math.pow(v, 0.16) + 0.4275 * t * Math.pow(v, 0.16);
  return chill - t;
}
