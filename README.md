
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
