import {
  AccessoryPlugin,
  HAP,
  Logging,
  Service,
} from 'homebridge';

import {KM200} from './lib/km200';

// The KM200 reports these values when a sensor is missing or defective
const SENSOR_OPEN = -3276.8;
const SENSOR_SHORT = 3276.7;

export class LogamaticOutdoor implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly hap: HAP;
  private readonly km200: KM200;

  name: string;

  private readonly temperatureService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, km200: KM200) {
    this.log = log;
    this.hap = hap;
    this.name = name;

    this.km200 = km200;

    this.temperatureService = new hap.Service.TemperatureSensor(name);

    this.temperatureService.getCharacteristic(hap.Characteristic.CurrentTemperature)
      .setProps({
        minValue: -60,
        maxValue: 100,
        minStep: 0.1,
      })
      .onGet(async () => {
        let value: number;
        try {
          value = (await this.km200.get('system/sensors/temperatures/outdoor_t1'))['value'];
        } catch (e) {
          this.log.debug('Could not read outdoor temperature: %s', e);
          throw new hap.HapStatusError(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        if (typeof value !== 'number' || value === SENSOR_OPEN || value === SENSOR_SHORT) {
          this.log.debug('No valid outdoor temperature: %s', value);
          throw new hap.HapStatusError(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        return value;
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Buderus')
      .setCharacteristic(
        hap.Characteristic.Model,
        'KM200',
      )
      .setCharacteristic(hap.Characteristic.FirmwareRevision, '1')
      .setCharacteristic(hap.Characteristic.SerialNumber, '1');

    log.info('Logamatic \'%s\' created!', name);

    this.km200.onPoll(() => this.refresh());
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
      this.temperatureService,
    ];
  }

  private async refresh() {
    // A failed read must not end the refresh cycle
    await this.temperatureService.getCharacteristic(this.hap.Characteristic.CurrentTemperature).handleGetRequest()
      .catch(() => undefined);
  }
}
