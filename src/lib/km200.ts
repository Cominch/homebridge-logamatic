import crypto from 'crypto';
import mcrypt from 'js-rijndael';

import fetch from 'node-fetch-retry';

const km200_crypt_md5_salt = new Uint8Array([
  0x86, 0x78, 0x45, 0xe9, 0x7c, 0x4e, 0x29, 0xdc,
  0xe5, 0x22, 0xb9, 0xa7, 0xd3, 0xa3, 0xe0, 0x7b,
  0x15, 0x2b, 0xff, 0xad, 0xdd, 0xbe, 0xd7, 0xf5,
  0xff, 0xd8, 0x42, 0xe9, 0x89, 0x5a, 0xd1, 0xe4,
]);

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

  async get(service: string) {
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