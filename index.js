const { getRandomValues } = require('expo-crypto');

const globalCrypto = globalThis.crypto || (globalThis.crypto = {});
if (typeof globalCrypto.getRandomValues !== 'function') {
  globalCrypto.getRandomValues = getRandomValues;
}

require('expo-router/entry');
