import {
  AccessoryPlugin,
  HAP,
  Logging,
  PlatformConfig,
  Service,
} from 'homebridge';

import {KM200} from './lib/km200';

// The KM200 reports these values when a sensor is missing or defective
const SENSOR_OPEN = -3276.8;
const SENSOR_SHORT = 3276.7;

export class LogamaticSolar implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly hap: HAP;
  private readonly config: PlatformConfig;
  private readonly km200: KM200;

  private timeoutId: NodeJS.Timeout | undefined;

  name: string;

  private readonly collectorService: Service;
  private readonly tankService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, config: PlatformConfig, km200: KM200) {
    this.log = log;
    this.hap = hap;
    this.name = name;
    this.config = config;

    this.timeoutId = undefined;

    this.km200 = km200;

    this.collectorService = this.createSensor('Solar Collector', 'collector', 'collectorTemperature');
    this.tankService = this.createSensor('Solar Tank', 'tank', 'dhwTankTemperature');

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Buderus')
      .setCharacteristic(
        hap.Characteristic.Model,
        'KM200',
      )
      .setCharacteristic(hap.Characteristic.FirmwareRevision, '1')
      .setCharacteristic(hap.Characteristic.SerialNumber, '1');

    log.info('Logamatic \'%s\' created!', name);

    this.refreshTimeout();
  }

  private createSensor(name: string, subtype: string, resource: string): Service {
    const service = new this.hap.Service.TemperatureSensor(name, subtype);

    service.getCharacteristic(this.hap.Characteristic.CurrentTemperature)
      // Collectors drop below 0 °C in winter and exceed 100 °C during stagnation
      .setProps({
        minValue: -60,
        maxValue: 300,
        minStep: 0.1,
      })
      .onGet(async () => {
        const path = `solarCircuits/${this.config.solarCircuit}/${resource}`;

        let value: number;
        try {
          value = (await this.km200.get(path))['value'];
        } catch (e) {
          this.log.debug('Could not read %s: %s', path, e);
          throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        if (typeof value !== 'number' || value === SENSOR_OPEN || value === SENSOR_SHORT) {
          this.log.debug('No valid temperature at %s: %s', path, value);
          throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        return value;
      });

    return service;
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log('Identify!');
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.collectorService,
      this.tankService,
    ];
  }

  refreshTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = setTimeout(async () => {
      // A failed read must not end the refresh cycle
      await Promise.all([this.collectorService, this.tankService].map(service =>
        service.getCharacteristic(this.hap.Characteristic.CurrentTemperature).handleGetRequest().catch(() => undefined),
      ));
      this.refreshTimeout();
    }, 20000);
  }
}
