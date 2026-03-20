"use client";

import { useEffect, useState } from "react";

type MarketData = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
  chartData: number[];
};

type WeatherData = {
  temperature: number;
  condition: string;
  tempHigh: number;
  tempLow: number;
  feelsLike: number;
  lastUpdated: string;
};

export default function HomePage() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState<Date | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState<string>("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/briefing", { next: { revalidate: 0 } });
      if (!res.ok) throw new Error("Failed to fetch briefing data");
      const json = await res.json();

      setWeather({
        ...json.weather,
        lastUpdated: new Date(json.weather.lastUpdated),
      });
      setMarkets(
        json.markets.map((m: any) => ({
          ...m,
          lastUpdated: new Date(m.lastUpdated),
        }))
      );
      setLastGlobalUpdate(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh schedule at 6am and 12pm local
  useEffect(() => {
    const scheduleNextRefresh = () => {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      const local = new Date(now.getTime() - tzOffset);

      const sixAM = new Date(local);
      sixAM.setHours(6, 0, 0, 0);
      const twelvePM = new Date(local);
      twelvePM.setHours(12, 0, 0, 0);

      const sixAM_utc = new Date(sixAM.getTime() + tzOffset);
      const twelvePM_utc = new Date(twelvePM.getTime() + tzOffset);

      const candidates = [sixAM_utc, twelvePM_utc].filter((d) => d > now);
      const next = candidates[0];

      if (next) {
        setRefreshCountdown(
          `Next auto-refresh in ${Math.round((next.getTime() - now.getTime()) / 60000)} minutes`
        );
      } else {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(6, 0, 0, 0);
        setRefreshCountdown(
          `Next auto-refresh in ${Math.round((tomorrow.getTime() - now.getTime()) / 60000)} minutes`
        );
      }
    };

    scheduleNextRefresh();
    const interval = setInterval(scheduleNextRefresh, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Initial fetch and scheduled refresh at 6am/12pm
  useEffect(() => {
    fetchData();
    const checkAndRefreshAtTimes = () => {
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      const hours = local.getHours();
      const minutes = local.getMinutes();

      if ((hours === 6 || hours === 12) && minutes === 0) {
        fetchData();
      }
    };
    const interval = setInterval(checkAndRefreshAtTimes, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    fetchData();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Build a simple SVG sparkline polyline
  const buildSparkline = (
    data: number[],
    width: number = 100,
    height: number = 20
  ): string => {
    if (!data || data.length === 0) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const points = data
      .map((val, i) => {
        const x = i * stepX;
        const y = height - ((val - min) / range) * height;
        return `${x},${y}`;
      })
      .join(" ");
    return points;
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
              <span className="text-gray-600">
                H:{weather.tempHigh}° L:{weather.tempLow}°
              </span>
              <span className="text-gray-500">|</span>
              <span className="text-gray-600">
                Feels like {weather.feelsLike}°F
              </span>
            </div>
          )}
        </header>

        {/* Manual Refresh Bar */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-500">
            {loading
              ? "Updating..."
              : `Last updated: ${lastGlobalUpdate ? formatTime(lastGlobalUpdate) : "Never"}`}
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
          <h2 className="text-2xl font-semibold mb-4 text-gray-900">
            Markets Snapshot
          </h2>
          {loading && markets.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 bg-white rounded-2xl animate-pulse border border-gray-200"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {markets.map((m) => (
                <div
                  key={m.symbol}
                  className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition flex flex-col"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-500 mb-1">
                      {m.symbol}
                    </div>
                    <div className="text-2xl font-semibold text-gray-900">
                      ${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div
                      className={`text-sm mt-1 ${m.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {m.changePercent >= 0 ? "+" : ""}
                      {m.changePercent.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Updated{" "}
                      {m.lastUpdated.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </div>
                  </div>

                  {/* Sparkline chart */}
                  <div className="mt-4 h-12 w-full">
                    {m.chartData && m.chartData.length > 0 ? (
                      <svg
                        viewBox="0 0 100 20"
                        preserveAspectRatio="none"
                        className="w-full h-full"
                      >
                        <polyline
                          points={buildSparkline(m.chartData, 100, 20)}
                          fill="none"
                          stroke={m.changePercent >= 0 ? "#34C759" : "#FF3B30"}
                          strokeWidth="1.5"
                        />
                      </svg>
                    ) : (
                      <div className="text-xs text-gray-400">
                        No chart data
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
            Error: {error}
          </div>
        )}
      </div>
    </div>
  );
}
