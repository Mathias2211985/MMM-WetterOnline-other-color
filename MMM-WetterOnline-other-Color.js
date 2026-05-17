/* MagicMirror²
 * Module: MMM-WetterOnline-other-Color
 * Datenquelle: Weather Underground / weather.com API v3
 */
Module.register("MMM-WetterOnline-other-Color", {

	defaults: {
		useHeader: true,
		header: "",
		lat: "51.898280",
		lon: "12.267471",
		apiKey: "",
		pwsStationId: "", // optional: WU-Stations-ID für echte Ist-Temperatur (z.B. "IDESSA126")
		width: "400px",
		daysTrend: 5,
		updateIntervalMins: 60, // 60 Min = 24 Requests/Tag (Limit: 1500/Tag)
		showSunHours: false,
		showAirPressure: null
	},

	weatherData: {},

	getStyles() {
		return ["MMM-WetterOnline-other-Color.css"];
	},

	getScripts() {
		return [];
	},

	requiresVersion: "2.2.0",

	start() {
		var self = this;
		var payload = { lat: this.config.lat, lon: this.config.lon, apiKey: this.config.apiKey, pwsStationId: this.config.pwsStationId };
		setInterval(function () {
			self.sendSocketNotification("WETTERONLINE_REFRESH", payload);
		}, this.config.updateIntervalMins * 60 * 1000);
		self.sendSocketNotification("WETTERONLINE_REFRESH", payload);
	},

	getTempClass(temp) {
		// Konvertiere String zu Zahl falls nötig
		var tempNum = parseFloat(temp);
		return `temp-${temp}`;
	},

	getDom() {
		var wrapper = document.createElement("div");
		wrapper.classList.add("small");

		if (Object.keys(this.weatherData).length > 0) {
			var currentWrapper = document.createElement("div");
			currentWrapper.classList.add("weather");
			var tempClass = this.getTempClass(this.weatherData.currentTemp);
			currentWrapper.insertAdjacentHTML("beforeend", `<span class="logo-container"><img src="${this.weatherData.symbolUrls.hourlies}${this.weatherData.hourlies[0].symbol}.svg" class="inverted" width="64" /> <span class="current-temp ${tempClass}">${this.weatherData.currentTemp}&deg;C</span></span>`);
			currentWrapper.insertAdjacentHTML("beforeend", "<br />");
			currentWrapper.insertAdjacentHTML("beforeend", this.weatherData.currConditions.symbol_text);
			currentWrapper.insertAdjacentHTML("beforeend", "<br />");
			currentWrapper.insertAdjacentHTML("beforeend", `${this.weatherData.currConditions.wind_speed_text}, ${this.weatherData.currConditions.wind_speed_kmh}km/h`);

			wrapper.appendChild(currentWrapper);

			if (parseInt(this.config.daysTrend) > 0) {
				wrapper.insertAdjacentHTML("beforeend", "<br />");

				var ft = document.createElement("table");

				var headerHtml = "<tr>";
				for (let i = 0; i < this.weatherData.dailies.length && i < this.config.daysTrend; i++) {
					headerHtml += `<th class="trendcell">${this.weatherData.dailies[i].day_time_label}</th>`;
				}
				ft.insertAdjacentHTML("beforeend", `${headerHtml}</tr>`);

				var dailyEntriesHtml = "<tr>";
				for (let i = 0; i < this.weatherData.dailies.length && i < this.config.daysTrend; i++) {
					dailyEntriesHtml += "<td class='trendcell'>";
					dailyEntriesHtml += `<img src="${this.weatherData.symbolUrls.dailies}${this.weatherData.dailies[i].symbol}.svg" class="inverted" width="32" />`;
					dailyEntriesHtml += "<br />";
					if (this.config.showSunHours === true) {
						dailyEntriesHtml += `<span class="logo-container"><img class="legend-logo" src="${this.file("assets/sun-svgrepo-com.svg")}" /> ${this.weatherData.dailies[i].sunhours}</span>`;
						dailyEntriesHtml += "<br />";
					}
					dailyEntriesHtml += `<span class="temp-${this.weatherData.dailies[i].high} logo-container"><img class="legend-logo inverted" src="${this.file("assets/high-temperature.svg")}" /> ${this.weatherData.dailies[i].high}</span>`;
					dailyEntriesHtml += "<br />";
					dailyEntriesHtml += `<span class="temp-${this.weatherData.dailies[i].low} logo-container"><img class="legend-logo inverted" src="${this.file("assets/low-temperature.svg")}" />${this.weatherData.dailies[i].low}</span>`;
					dailyEntriesHtml += "<br />";
					if (
						this.config.showAirPressure === 'hpa' ||
						this.config.showAirPressure === 'inhg' ||
						this.config.showAirPressure === 'mmhg'
					) {
						dailyEntriesHtml += `<span class="logo-container">${this.weatherData.dailies[i].air_pressure[this.config.showAirPressure]}<span class="mmm-wetteronline-tiny-font">${this.config.showAirPressure}</span></span>`;
						dailyEntriesHtml += "<br />";
					}
					dailyEntriesHtml += `<span class="precipitation logo-container"><img class="legend-logo" src="${this.file("assets/umbrella.svg")}" /> ${this.weatherData.dailies[i].pop}%</span>`;
					dailyEntriesHtml += "</td>";
				}
				ft.insertAdjacentHTML("beforeend", `${dailyEntriesHtml}</tr>`);

				wrapper.appendChild(ft);
			}
		}

		return wrapper;
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "WETTERONLINE_RESULTS") {
			this.weatherData = payload;
			this.updateDom();
		}
	}
});