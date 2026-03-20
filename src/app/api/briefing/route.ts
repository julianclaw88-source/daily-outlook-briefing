import { NextResponse } from "next/server";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=35.2271&longitude=-80.8431&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&forecast_days=1";

const SYMBOLS = ["GLDM", "SLVR", "SILJ", "CAPR", "SPY", "QQQ", "BTC", "TRX", "SOL"];

const CRYPTO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  TRX: "tron",
  SOL: "solana",
};

export async function GET() {
  // 1. Fetch weather
  const weatherRes = await fetch(OPEN_METEO_URL, { next: { revalidate: 0 } });
  if (!weatherRes.ok) {
    throw new Error("Weather fetch failed");
  }
  const weatherJson = await weatherRes.json();
  const current = weatherJson.current_weather;
  const daily = weatherJson.daily;

  // Convert Celsius to Fahrenheit
  const cToF = (c: number) => Math.round((c * 9/5) + 32);

  const weather = {
    temperature: cToF(current.temperature),
    condition: mapWMOToCondition(current.weathercode),
    tempHigh: cToF(daily.temperature_2m_max[0]),
    tempLow: cToF(daily.temperature_2m_min[0]),
    feelsLike: cToF(
      current.temperature +
        (windChillAdjustment(current.temperature, current.windspeed) || 0)
    ),
    lastUpdated: new Date().toISOString(),
  };

  // 2. Fetch market data (quotes + sparkline charts for crypto only)
  const marketPromises = SYMBOLS.map(async (symbol) => {
    const isCrypto = ["BTC", "TRX", "SOL"].includes(symbol);
    let quoteData: any = null;
    let chartData: number[] = [];

    try {
      if (isCrypto) {
        // CoinGecko: quote
        const coinId = CRYPTO_IDS[symbol];
        const quoteRes = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
        );
        if (quoteRes.ok) {
          const quoteJson = await quoteRes.json();
          const coin = quoteJson[coinId];
          quoteData = {
            price: coin.usd,
            change: coin.usd_24h_change,
            changePercent: coin.usd_24h_change,
          };

          // Chart: last 24h hourly prices
          const chartRes = await fetch(
            `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=1&interval=hourly`
          );
          if (chartRes.ok) {
            const chartJson = await chartRes.json();
            chartData = chartJson.prices.map((p: [number, number]) => p[1]);
          }
        }
      } else {
        // Finnhub: quote only (no chart due to API limitations)
        const quoteRes = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
        );
        if (quoteRes.ok) {
          const q = await quoteRes.json();
          quoteData = {
            price: q.c,
            change: q.c - q.pc,
            changePercent: ((q.c - q.pc) / q.pc) * 100,
          };
        }
      }

      if (!quoteData) return null;

      return {
        symbol,
        ...quoteData,
        chartData, // empty array for non-crypto
        lastUpdated: new Date().toISOString(),
      };
    } catch (e) {
      console.error(`Error fetching ${symbol}:`, e);
      return null;
    }
  });

  const markets = (await Promise.all(marketPromises)).filter(Boolean);

  return NextResponse.json({ weather, markets });
}

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

function windChillAdjustment(tempF: number, windSpeedKph: number): number | null {
  if (tempF > 50) return 0;
  const windSpeedMph = windSpeedKph * 0.621371;
  const t = tempF;
  const v = windSpeedMph;
  const chill = 35.74 + 0.6215 * t - 35.75 * Math.pow(v, 0.16) + 0.4275 * t * Math.pow(v, 0.16);
  return chill - t;
}
