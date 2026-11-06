import {AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin} from 'homebridge';

import {LogamaticHeater} from './heater-accessory';
import {LogamaticWater} from './water-accessory';
import {LogamaticSolar} from './solar-accessory';
import {LogamaticPressure} from './pressure-accessory';

import {KM200} from './lib/km200';

export class LogamaticPlatform implements StaticPlatformPlugin {

  private readonly log: Logging;
  private readonly hap: HAP;
  private readonly config: PlatformConfig;

  private readonly km200: KM200;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.hap = api.hap;
    this.config = config;

    this.km200 = new KM200();

    this.km200.init(this.config.url, this.config.gatewayPassword, this.config.privatePassword);

    log.info('Logamatic finished initializing!');
  }

  /*
   * This method is called to retrieve all accessories exposed by the platform.
   * The Platform can delay the response my invoking the callback at a later time,
   * it will delay the bridge startup though, so keep it to a minimum.
   * The set of exposed accessories CANNOT change over the lifetime of the plugin!
   */
  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    this.km200.getAlways('system/healthStatus')
      .catch((e) => {
        // An unreachable KM200 must not take down Homebridge, the accessories recover once it is back
        this.log.error('Could not reach KM200 at startup: %s', e.message);
      })
      .finally(() => {
        const accessories: AccessoryPlugin[] = [
          new LogamaticHeater(
            this.hap,
            this.log,
            'Heater',
            this.config,
            this.km200,
          ),
          new LogamaticWater(
            this.hap,
            this.log,
            'Water Boiler',
            this.config,
            this.km200,
          ),
        ];

        if (this.config.solarCircuit) {
          accessories.push(new LogamaticSolar(
            this.hap,
            this.log,
            'Solar',
            this.config,
            this.km200,
          ));
        }

        if (this.config.systemPressure) {
          accessories.push(new LogamaticPressure(
            this.hap,
            this.log,
            'System Pressure',
            this.km200,
          ));
        }

        callback(accessories);
      });
  }
}
