
# homebridge-logamatic

(Unofficial) Homebridge Plugin for a Logamatic KM200 (Buderus/Bosch Thermotechnik) gas heater.

This Plugin is considered to be complete.

If you encounter a bug or want to propose a new feature feel free to open an issue!

If you like this plugin it is possible to donate a "cup of coffee" via Paypal:

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/npluseins)


# Installation
1. Install [Homebridge](https://github.com/nfarina/homebridge): `sudo npm install -g --unsafe-perm homebridge`
2. Install this plugin `sudo npm install -g homebridge-logamatic`
3. Add this plugin as a platform to your `config.json` file

# Solar circuit
Set the optional `solarCircuit` option (e.g. `"solarCircuit": "sc1"`) to add a `Solar` accessory with two read-only temperature sensors:

| Sensor | KM200 resource |
| --- | --- |
| Solar Collector | `solarCircuits/<solarCircuit>/collectorTemperature` |
| Solar Tank | `solarCircuits/<solarCircuit>/dhwTankTemperature` |

A sensor shows "No Response" if the KM200 does not provide the resource or reports a missing or defective sensor.

# System pressure
Set the optional `systemPressure` option (`"systemPressure": true`) to add a `System Pressure` accessory that reads `heatSources/systemPressure`.

HomeKit has no pressure sensor, so the value in bar is shown as a temperature: 1.5° means 1.5 bar. Put this accessory in a room of its own, because the Home app includes it in the room's temperature range.

# Outdoor temperature
Set the optional `outdoorTemperature` option (`"outdoorTemperature": true`) to add an `Outdoor Temperature` sensor that reads `system/sensors/temperatures/outdoor_t1`.

# Poll interval
Set the optional `pollInterval` option to choose how often the values are read from the KM200, in seconds (default 20, minimum 5). HomeKit is answered from these values, so they can be as old as the interval. After a KM200 failure the last values stay visible for 2 minutes or 3 intervals, whichever is longer.

# Multiple heating circuits
Set the optional `heaterCircuits` option (e.g. `"heaterCircuits": ["hc1", "hc2"]`) to add one thermostat per circuit. It replaces `heaterCircuit`. The first circuit is called `Heater`, the others `Heater hc2` and so on.
