import {
  AccessoryPlugin,
  HAP,
  Logging,
  Service,
} from 'homebridge';

import {KM200} from './lib/km200';

// The KM200 reports this value when the pressure is not available
const PRESSURE_INVALID = 25.5;

export class LogamaticPressure implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly hap: HAP;
  private readonly km200: KM200;

  name: string;

  private readonly pressureService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, name: string, km200: KM200) {
    this.log = log;
    this.hap = hap;
    this.name = name;

    this.km200 = km200;

    // HomeKit has no pressure sensor, so the value in bar is shown as a temperature
    this.pressureService = new hap.Service.TemperatureSensor(`${name} bar`);

    this.pressureService.getCharacteristic(hap.Characteristic.CurrentTemperature)
      .setProps({
        minValue: 0,
        maxValue: 30,
        minStep: 0.1,
      })
      .onGet(async () => {
        let value: number;
        try {
          value = (await this.km200.get('heatSources/systemPressure'))['value'];
        } catch (e) {
          this.log.debug('Could not read system pressure: %s', e);
          throw new hap.HapStatusError(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        if (typeof value !== 'number' || value === PRESSURE_INVALID) {
          this.log.debug('No valid system pressure: %s', value);
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
      this.pressureService,
    ];
  }

  private async refresh() {
    // A failed read must not end the refresh cycle
    await this.pressureService.getCharacteristic(this.hap.Characteristic.CurrentTemperature).handleGetRequest()
      .catch(() => undefined);
  }
}
