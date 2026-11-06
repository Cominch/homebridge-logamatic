import crypto from 'crypto';
import mcrypt from 'js-rijndael';

import fetch from 'node-fetch-retry';

const km200_crypt_md5_salt = new Uint8Array([
  0x86, 0x78, 0x45, 0xe9, 0x7c, 0x4e, 0x29, 0xdc,
  0xe5, 0x22, 0xb9, 0xa7, 0xd3, 0xa3, 0xe0, 0x7b,
  0x15, 0x2b, 0xff, 0xad, 0xdd, 0xbe, 0xd7, 0xf5,
  0xff, 0xd8, 0x42, 0xe9, 0x89, 0x5a, 0xd1, 0xe4,
]);

// A cached value is at least valid for this long, the read then waits for the KM200
const CACHE_MIN_AGE_MS = 120000;
// After a timeout reads fail right away for this long, so they do not pile up in the queue
const OFFLINE_BACKOFF_MS = 30000;

const timeout = (ms, message) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
};

export class KM200 {
  aesKey: number[];
  options: unknown;
  log: unknown;
  accessUrl: string;

  private queue: Promise<unknown> = Promise.resolve();
  private readonly cache = new Map<string, { data: unknown; time: number }>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private offlineUntil = 0;
  private cacheMaxAgeMs = CACHE_MIN_AGE_MS;
  private readonly pollListeners: (() => Promise<unknown>)[] = [];

  constructor() {
    this.aesKey = []; // buffer will be generated on init from accessKey
    this.accessUrl = '';
    this.options = {};
  }

  init(accessUrl, gwpw, prpw) {
    function getAccesskey(gatewaypassword, privatepassword) {
      function md5(text) {
        return crypto.createHash('md5').update(text).digest('hex');
      }

      function str2ab(str) {
        const buf = new ArrayBuffer(str.length * 1); // 2 bytes for each char
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
          bufView[i] = str.charCodeAt(i);
        }
        return bufView;
      }

      function concatUint8Array(array1, array2) {
        const array3 = new Uint8Array(array1.length + array2.length);
        for (let i = 0; i < array1.length; i++) {
          array3[i] = array1[i];
        }
        for (let i = 0; i < array2.length; i++) {
          array3[array1.length + i] = array2[i];
        }
        return array3;
      }

      gatewaypassword = gatewaypassword.replace(/-/g, '');
      const km200_gateway_password = str2ab(gatewaypassword);
      const km200_private_password = str2ab(privatepassword);

      const key_1 = md5(concatUint8Array(km200_gateway_password, km200_crypt_md5_salt));

      const key_2_private = md5(concatUint8Array(km200_crypt_md5_salt, km200_private_password));

      const km200_crypt_key_private = key_1 + key_2_private;
      return km200_crypt_key_private.trim().toLowerCase();
    }

    this.aesKey = Array.from(Buffer.from((/^[0-9a-f]{64}$/.test(gwpw)) ? gwpw : getAccesskey(gwpw, prpw), 'hex'));

    this.accessUrl = accessUrl;

    this.options = {
      timeout: 5000,
      status: [200],
      encoding: 'utf8',
      headers: {
        'agent': 'TeleHeater/2.2.3',
        'User-Agent': 'TeleHeater/2.2.3',
        'Accept': 'application/json',
      },
    };
  }

  async getAlways(service: string) {
    this.options = {
      timeout: 1000,
      method: 'GET',
      retry: 50,
      pause: 1000,
      silent: true,
      status: [200],
      encoding: 'utf8',
      headers: {
        'agent': 'TeleHeater/2.2.3',
        'User-Agent': 'TeleHeater/2.2.3',
        'Accept': 'application/json',
      },
    };

    return await Promise.race([
      timeout(50000, `Timeout while fetching data from KM200 (${service}).`),
      fetch(this.accessUrl + '/' + service, this.options)
        .then(data => data.text())
        .then(data => {
          const b = Buffer.from(data, 'base64');
          try {
            let s = Array.from(b);
            s = mcrypt.decrypt(s, null, this.aesKey, 'rijndael-128', 'ecb');
            const s2 = Buffer.from(s).toString('utf8');

            const j = JSON.parse(s2);
            return j;
            // eslint-disable-next-line no-empty
          } catch (e) {
            throw(e);
          }
        })
    ]);
  }

  // The KM200 answers slowly when asked in parallel, so all requests run one after the other
  private enqueue<T>(request: () => Promise<T>): Promise<T> {
    const result = this.queue.then(request);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private refresh(service: string) {
    let request = this.pending.get(service);
    if (!request) {
      request = this.enqueue(async () => {
        if (Date.now() < this.offlineUntil) {
          throw new Error(`KM200 is not reachable (${service}).`);
        }
        try {
          return await this.request(service);
        } catch (e) {
          if (!(e instanceof SyntaxError)) {
            this.offlineUntil = Date.now() + OFFLINE_BACKOFF_MS;
          }
          throw e;
        }
      })
        .then(data => {
          this.cache.set(service, {data, time: Date.now()});
          return data;
        })
        .finally(() => this.pending.delete(service));
      this.pending.set(service, request);
    }
    return request;
  }

  async get(service: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const cached = this.cache.get(service);

    if (cached && Date.now() - cached.time < this.cacheMaxAgeMs) {
      return cached.data;
    }

    return this.refresh(service);
  }

  onPoll(listener: () => Promise<unknown>) {
    this.pollListeners.push(listener);
  }

  // Reads all known values from the KM200, then lets the accessories pick them up from the cache
  startPolling(seconds: number) {
    this.cacheMaxAgeMs = Math.max(CACHE_MIN_AGE_MS, 3 * seconds * 1000);

    const poll = async () => {
      for (const service of Array.from(this.cache.keys())) {
        await this.refresh(service).catch(() => undefined);
      }
      for (const listener of this.pollListeners) {
        await listener().catch(() => undefined);
      }
      setTimeout(poll, seconds * 1000);
    };

    poll();
  }

  private async request(service: string) {
    this.options = {
      timeout: 500,
      method: 'GET',
      retry: 10,
      pause: 500,
      silent: true,
      status: [200],
      encoding: 'utf8',
      headers: {
        'agent': 'TeleHeater/2.2.3',
        'User-Agent': 'TeleHeater/2.2.3',
        'Accept': 'application/json',
      },
    };

    return await Promise.race([
      timeout(5000, `Timeout while fetching data from KM200 (${service}).`),
      fetch(this.accessUrl + '/' + service, this.options)
        .then(data => data.text())
        .then(data => {
          const b = Buffer.from(data, 'base64');
          try {
            let s = Array.from(b);
            s = mcrypt.decrypt(s, null, this.aesKey, 'rijndael-128', 'ecb');
            const s2 = Buffer.from(s).toString('utf8');

            const j = JSON.parse(s2);
            return j;
            // eslint-disable-next-line no-empty
          } catch (e) {
            throw(e);
          }
        })
    ]);
  }

  async set(service: string, value: unknown) {
    const result = await this.enqueue(() => this.post(service, value));
    this.cache.delete(service);
    return result;
  }

  private async post(service: string, value: unknown) {
    const post = JSON.stringify({
      value: value,
    });
    const postArray = Array.from(Buffer.from(post, 'utf8'));
    const postArrayEncrypted = mcrypt.encrypt(postArray, null, this.aesKey, 'rijndael-128', 'ecb');
    const postBuffer = Buffer.from(postArrayEncrypted);
    const postString = postBuffer.toString('base64');

    this.options = {
      timeout: 500,
      method: 'POST',
      body: postString,
      status: [200],
      encoding: 'utf8',
      headers: {
        'agent': 'TeleHeater/2.2.3',
        'User-Agent': 'TeleHeater/2.2.3',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    return await Promise.race([
      timeout(500, 'Timeout while sending data to KM200.'),
      fetch(this.accessUrl + '/' + service, this.options)
        .then(data => data.text()),
    ]);
  }
}