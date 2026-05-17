const Log = require("logger");
const NodeHelper = require("node_helper");

const WU_ICON_MAP = [
	"wi-thunderstorm",            // 0
	"wi-storm-showers",           // 1
	"wi-thunderstorm",            // 2
	"wi-thunderstorm",            // 3
	"wi-thunderstorm",            // 4
	"wi-rain-mix",                // 5
	"wi-rain-mix",                // 6
	"wi-rain-mix",                // 7
	"wi-sprinkle",                // 8
	"wi-sprinkle",                // 9
	"wi-hail",                    // 10
	"wi-showers",                 // 11
	"wi-showers",                 // 12
	"wi-snow",                    // 13
	"wi-snow",                    // 14
	"wi-snow",                    // 15
	"wi-snow",                    // 16
	"wi-hail",                    // 17
	"wi-sleet",                   // 18
	"wi-cloudy-gusts",            // 19
	"wi-fog",                     // 20
	"wi-fog",                     // 21
	"wi-smoke",                   // 22
	"wi-cloudy-gusts",            // 23
	"wi-cloudy-windy",            // 24
	"wi-thermometer",             // 25
	"wi-cloudy",                  // 26
	"wi-night-alt-cloudy",        // 27
	"wi-day-cloudy",              // 28
	"wi-night-alt-partly-cloudy", // 29
	"wi-day-cloudy",              // 30
	"wi-night-clear",             // 31
	"wi-day-sunny",               // 32
	"wi-night-alt-partly-cloudy", // 33
	"wi-day-sunny-overcast",      // 34
	"wi-hail",                    // 35
	"wi-day-sunny",               // 36
	"wi-day-storm-showers",       // 37
	"wi-storm-showers",           // 38
	"wi-day-showers",             // 39
	"wi-showers",                 // 40
	"wi-snow-wind",               // 41
	"wi-snow",                    // 42
	"wi-snow",                    // 43
	"wi-day-cloudy",              // 44
	"wi-storm-showers",           // 45
	"wi-snow",                    // 46
	"wi-day-storm-showers",       // 47
];

// GitHub-based jsDelivr URL (npm package contains no SVG files)
const ICON_BASE = "https://cdn.jsdelivr.net/gh/erikflowers/weather-icons@2.0.12/svg/";

// Windrichtung in Grad → Himmelsrichtung
function degreesToCardinal(deg) {
	const dirs = ["N","NNO","NO","ONO","O","OSO","SO","SSO","S","SSW","SW","WSW","W","WNW","NW","NNW"];
	return dirs[Math.round(deg / 22.5) % 16];
}

module.exports = NodeHelper.create({
	async socketNotificationReceived(notification, payload) {
		Log.log("[WU] Notification empfangen: " + notification);
		if (notification === "WETTERONLINE_REFRESH") {
			Log.log("[WU] Starte API-Abruf für lat=" + payload.lat + " lon=" + payload.lon);
			await this.updateWeather(payload.lat, payload.lon, payload.apiKey, payload.pwsStationId);
		}
	},

	async updateWeather(lat, lon, apiKey, pwsStationId) {
		try {
			const forecastUrl = `https://api.weather.com/v3/wx/forecast/daily/5day?geocode=${lat},${lon}&format=json&units=m&language=de-DE&apiKey=${apiKey}`;

			// PWS-Abruf parallel zum Forecast, wenn Stations-ID konfiguriert
			const requests = [fetch(forecastUrl)];
			if (pwsStationId) {
				const pwsUrl = `https://api.weather.com/v2/pws/observations/current?stationId=${pwsStationId}&format=json&units=m&apiKey=${apiKey}`;
				requests.push(fetch(pwsUrl));
			}

			const responses = await Promise.all(requests);
			if (!responses[0].ok) throw new Error(`Forecast HTTP ${responses[0].status}`);
			const forecast = await responses[0].json();

			let pws = null;
			if (pwsStationId && responses[1] && responses[1].ok) {
				const pwsData = await responses[1].json();
				pws = pwsData.observations?.[0] ?? null;
				if (pws) Log.log("[WU] PWS-Temperatur: " + pws.metric.temp + "°C");
			}

			const event = this.buildEvent(forecast, pws);
			Log.log("[WU] Daten erfolgreich verarbeitet, sende WETTERONLINE_RESULTS");
			this.sendSocketNotification("WETTERONLINE_RESULTS", event);
		} catch (error) {
			Log.error("MMM-WetterOnline-other-Color (WU): " + error);
		}
	},

	icon(code) {
		return WU_ICON_MAP[code] || "wi-day-cloudy";
	},

	buildEvent(f, pws) {
		const dp = f.daypart[0];

		// Aktuellen Daypart anhand der Serverzeit bestimmen:
		// Index 0 = heute Tag (D, ca. 6-18 Uhr), Index 1 = heute Nacht (N, ca. 18-6 Uhr)
		const hour = new Date().getHours();
		const preferNight = hour >= 18 || hour < 6;
		let todayIdx;
		if (preferNight) {
			todayIdx = dp.iconCode[1] !== null ? 1 : 0;
		} else {
			todayIdx = dp.iconCode[0] !== null ? 0 : 1;
		}

		// Aktuelle Temperatur: PWS hat Vorrang (echte Messung), Fallback: Forecast-Periode
		const currTemp = pws
			? String(Math.round(pws.metric.temp))
			: String(dp.temperature[todayIdx] ?? "?");

		// Wind: PWS hat Vorrang
		const currWindDir = pws
			? degreesToCardinal(pws.winddir)
			: (dp.windDirectionCardinal[todayIdx] ?? "");
		const currWindKmh = pws
			? String(Math.round(pws.metric.windSpeed))
			: String(dp.windSpeed[todayIdx] ?? 0);

		const currText = dp.wxPhraseLong[todayIdx] ?? "";

		// hourlies: use all daypart periods (day+night alternating)
		const hourlies = [];
		for (let i = 0; i < dp.iconCode.length; i++) {
			if (dp.iconCode[i] === null) continue;
			hourlies.push({
				symbol: this.icon(dp.iconCode[i]),
				temperature: dp.temperature[i] ?? 0,
				wind_speed_kmh: dp.windSpeed[i] ?? 0,
				air_pressure: { hpa: 0, inhg: "0.00", mmhg: 0 }
			});
		}

		// dailies: one per calendar day
		const dailies = [];
		for (let i = 0; i < (f.temperatureMax || []).length; i++) {
			const dpIdx = i * 2; // daytime index for this day
			const ic = dp.iconCode[dpIdx] !== null
				? dp.iconCode[dpIdx]
				: (dp.iconCode[dpIdx + 1] !== null ? dp.iconCode[dpIdx + 1] : 32);
			const pop = dp.precipChance[dpIdx] !== null
				? dp.precipChance[dpIdx]
				: (dp.precipChance[dpIdx + 1] !== null ? dp.precipChance[dpIdx + 1] : 0);

			dailies.push({
				symbol: this.icon(ic),
				// calendarDayTemperature bleibt den ganzen Tag gültig (temperatureMax wird abends null)
				high: f.calendarDayTemperatureMax[i] ?? f.temperatureMax[i] ?? 0,
				low: f.calendarDayTemperatureMin[i] ?? f.temperatureMin[i] ?? 0,
				pop: pop ?? 0,
				day_time_label: (f.dayOfWeek[i] || "").substring(0, 2),
				sunhours: 0,
				air_pressure: { hpa: 0, inhg: "0.00", mmhg: 0 }
			});
		}

		return {
			currentTemp: currTemp,
			currConditions: {
				symbol_text: currText,
				wind_speed_text: currWindDir,
				wind_speed_kmh: currWindKmh,
				air_pressure: { hpa: 0, inhg: "0.00", mmhg: 0 }
			},
			hourlies: hourlies.length ? hourlies : [{ symbol: this.icon(32), temperature: 0, wind_speed_kmh: 0, air_pressure: {} }],
			dailies,
			symbolUrls: { dailies: ICON_BASE, hourlies: ICON_BASE }
		};
	}
});