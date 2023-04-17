import {
  AccessoryPlugin,
  CharacteristicValue,
  HAP,
  Logging,
  PlatformConfig,
  Service,
} from 'homebridge';

import {KM200} from './lib/km200';

export class LogamaticHeater implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly config: PlatformConfig;
  private readonly km200: KM200;

  private timeoutId: NodeJS.Timeout | undefined;
  private characteristic: HAP['Characteristic'];

  name: string;

  private readonly thermostatService: Service;
  private readonly informationService: Service;

  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor(hap: HAP, log: Logging, name: string, config: PlatformConfig, km200: KM200) {
    this.log = log;
    this.name = name;
    this.config = config;

    this.km200 = km200;

    this.thermostatService = new hap.Service.Thermostat(name);

    this.characteristic = hap.Characteristic;

    this.thermostatService.getCharacteristic(hap.Characteristic.CurrentHeatingCoolingState)
      .setProps({
        validValues: [0, 1, 2],
      })
      .onGet(async () => (
        await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/operationMode`)
          .then(data => {
            return data['value'];
          })
          .then(async (operationMode) => {
            if (operationMode === 'manual') {
              const manualRoomSetpointResponse = await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/manualRoomSetpoint`);
              return manualRoomSetpointResponse['value'] === 0 ? 0 : 1;
            } else {
              return 2;
            }
          })
          .catch(() => {
            return null;
          })

      ));

    this.thermostatService
      .getCharacteristic(hap.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [0, 1, 3],
      })
      .onGet(async () => (
        await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/operationMode`)
          .then(data => {
            return data['value'];
          })
          .then(async (operationMode) => {
            if (operationMode === 'manual') {
              const manualRoomSetpointResponse = await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/manualRoomSetpoint`);
              return manualRoomSetpointResponse['value'] === 0 ? 0 : 1;
            } else {
              return 3;
            }
          })
          .catch(() => {
            return null;
          })
      ))
      .onSet(async (value: CharacteristicValue) => {
        let targetValue = 'manual';
        let targetTemperature = 0;

        switch (value) {
          case 0:
            targetValue = 'manual';
            targetTemperature = 0;
            break;
          case 1:
            targetValue = 'manual';
            targetTemperature = 19;
            break;
          case 3: targetValue = 'auto';
            break;
          default: targetValue = 'manual';
        }

        await this.km200.set(`heatingCircuits/${this.config.heaterCircuit}/operationMode`, targetValue);

        if (value as number < 3) {
          await this.km200.set(`heatingCircuits/${this.config.heaterCircuit}/manualRoomSetpoint`, targetTemperature);
        }

        this.thermostatService.getCharacteristic(hap.Characteristic.CurrentHeatingCoolingState).updateValue(value === 3 ? 2 : value);
        this.thermostatService.getCharacteristic(hap.Characteristic.TargetTemperature).updateValue(targetTemperature);
      });

    this.thermostatService.getCharacteristic(hap.Characteristic.CurrentTemperature)
      .onGet(async () => (await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/actualSupplyTemperature`)
        .then(data => {
          return data['value'];
        }).catch(() => {
          return null;
        })
      )
        ,
      );

    this.thermostatService.getCharacteristic(hap.Characteristic.TargetTemperature)
      .setProps({
        minValue: 0,
        maxValue: 30,
        minStep: 1,
      })
      .onGet(async () => (
        await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/operationMode`)
          .then(data => {
            return data['value'];
          })
          .then(async (operationMode) => {
            if (operationMode === 'manual') {
              const manualRoomSetpointResponse = await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/manualRoomSetpoint`);
              return manualRoomSetpointResponse['value'];
            } else {
              const manualRoomSetpointResponse = await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/currentRoomSetpoint`);
              return manualRoomSetpointResponse['value'];
            }
          })
          .catch(() => {
            return null;
          })
      ))
      .onSet(async (value) => (
        await this.km200.get(`heatingCircuits/${this.config.heaterCircuit}/operationMode`)
          .then(data => {
            return data['value'];
          })
          .then(async (operationMode) => {
            if (operationMode === 'manual') {
              await this.km200.set(`heatingCircuits/${this.config.heaterCircuit}/manualRoomSetpoint`, value);
            } else {
              await this.km200.set(`heatingCircuits/${this.config.heaterCircuit}/temporaryRoomSetpoint`, value);
            }
          })
          .catch(() => {
            return null;
          })
      ));

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
    }, 21000);
  }
}
