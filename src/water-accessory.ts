import {
  AccessoryPlugin,
  HAP,
  Logging,
  PlatformConfig,
  Service,
} from 'homebridge';

import {KM200} from './lib/km200';

export class LogamaticWater implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly config: PlatformConfig;
  private readonly km200: KM200;

  private timeoutId: NodeJS.Timeout | undefined;
  private characteristic: HAP['Characteristic'];

  name: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  logamaticConfiguration: Object;

  private readonly thermostatService: Service;
  private readonly informationService: Service;

  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor(hap: HAP, log: Logging, name: string, config: PlatformConfig, logamaticConfiguration: Object, km200: KM200) {
    this.log = log;
    this.name = name;
    this.config = config;

    this.timeoutId = undefined;

    this.logamaticConfiguration = logamaticConfiguration;

    this.km200 = km200;

    this.thermostatService = new hap.Service.Thermostat(name);

    this.characteristic = hap.Characteristic;

    this.thermostatService.getCharacteristic(hap.Characteristic.CurrentHeatingCoolingState)
      .onGet(async () => (await this.km200.get(`dhwCircuits/${this.config.waterCircuit}/operationMode`)
        .then(data => {
          const currentValue = data['value'];

          let value = 0;

          switch (currentValue) {
            case 'Off': value = 0;
              break;
            case 'high': value = 1;
              break;
            case 'HCprogram': value = 3;
              break;
            case 'ownprogram': value = 3;
              break;
            default: value = 0;
          }

          return value;
        })));

    this.thermostatService
      .getCharacteristic(hap.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [0, 1, 3],
      })
      .onGet(async () => (
        await this.km200.get(`dhwCircuits/${this.config.waterCircuit}/operationMode`)
          .then(data => {
            const currentValue = data['value'];

            let value = 0;

            switch (currentValue) {
              case 'Off': value = 0;
                break;
              case 'high': value = 1;
                break;
              case 'HCprogram': value = 3;
                break;
              case 'ownprogram': value = 3;
                break;
              default: value = 0;
            }

            return value;
          })
      ))
      .onSet(async (value) => {
        let targetValue = 'Off';

        switch (value) {
          case 0: targetValue = 'Off';
            break;
          case 1: targetValue = 'high';
            break;
          case 3: targetValue = 'ownprogram';
            break;
          default: targetValue = 'Off';
        }

        await this.km200.set(`dhwCircuits/${this.config.waterCircuit}/operationMode`, targetValue);

        this.thermostatService.getCharacteristic(hap.Characteristic.CurrentHeatingCoolingState).updateValue(value);
        await this.thermostatService.getCharacteristic(this.characteristic.TargetTemperature).handleGetRequest();
      });

    this.thermostatService.getCharacteristic(hap.Characteristic.CurrentTemperature)
      .onGet(async () => (await this.km200.get(`dhwCircuits/${this.config.waterCircuit}/actualTemp`)
        .then(data => {
          return data['value'];
        })),
      );

    this.thermostatService.getCharacteristic(hap.Characteristic.TargetTemperature)
      .setProps({
        minValue: 10,
        maxValue: 80,
        minStep: 1,
      })
      .onGet(async () => (
        await this.km200.get(`dhwCircuits/${this.config.waterCircuit}/operationMode`)
          .then(data => {
            const currentValue = data['value'];

            let readParameter;

            switch (currentValue) {
              case 'Off':
              case 'high': readParameter = `dhwCircuits/${this.config.waterCircuit}/temperatureLevels/high`;
                break;
              case 'HCprogram':
              case 'ownprogram': readParameter = `dhwCircuits/${this.config.waterCircuit}/currentSetpoint`;
                break;
              default: readParameter = `dhwCircuits/${this.config.waterCircuit}/currentSetpoint`;
                break;
            }

            return readParameter;
          })
          .then(async (readParameter) => (await this.km200.get(readParameter)))
          .then(data => {
            return data['value'];
          })
      ))
      .onSet(async (value) => (await this.km200.set(`dhwCircuits/${this.config.waterCircuit}/temperatureLevels/high`, value)));

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
      this.thermostatService,
    ];
  }

  refreshTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = setTimeout(async () => {
      await this.thermostatService.getCharacteristic(this.characteristic.TargetHeatingCoolingState).handleGetRequest();
      await this.thermostatService.getCharacteristic(this.characteristic.CurrentTemperature).handleGetRequest();
      await this.thermostatService.getCharacteristic(this.characteristic.TargetTemperature).handleGetRequest();
      this.refreshTimeout();
    }, 20000);
  }
}
