import { Entry, Device, WhoAmIResponse, ShareMessage, Peer, computeFingerprint, bytesToBase64 } from './types';
import { boxSealBase64, boxOpenBase64 } from './crypto';
import { SERVICE_PORT } from './config';

const REQUEST_TIMEOUT = 5000;

type WhoAmIResponseRaw = Omit<WhoAmIResponse, 'pubkey'> & {
  pubkey: string | number[];
};

function normalizePubkey(pubkey: string | number[]): string {
  if (typeof pubkey === 'string') {
    return pubkey;
  }
  if (Array.isArray(pubkey)) {
    return bytesToBase64(new Uint8Array(pubkey));
  }
  throw new Error('Invalid pubkey format');
}

export async function fetchWhoAmI(host: string, port: number): Promise<WhoAmIResponse> {
  const url = `http://${host}:${port}/whoami`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const raw: WhoAmIResponseRaw = await response.json();
    return {
      ...raw,
      pubkey: normalizePubkey(raw.pubkey),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendShare(
  host: string,
  port: number,
  entry: Entry,
  senderDevice: Device,
  recipientPubKey: string
): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(entry));

  const ciphertextB64 = boxSealBase64(plaintext, recipientPubKey, senderDevice.privkey);

  const shareMsg: ShareMessage = {
    from_fingerprint: computeFingerprint(senderDevice.pubkey),
    ciphertext: ciphertextB64,
  };

  const url = `http://${host}:${port}/share`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(shareMsg),
      signal: controller.signal,
    });

    if (response.status !== 202) {
      const text = await response.text();
      throw new Error(`Server returned ${response.status}: ${text}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAndPair(address: string): Promise<Peer> {
  let host = address;
  let port = SERVICE_PORT;

  if (address.includes(':')) {
    const parts = address.split(':');
    host = parts[0];
    port = parseInt(parts[1], 10) || SERVICE_PORT;
  }

  const whoami = await fetchWhoAmI(host, port);

  const computedFp = computeFingerprint(whoami.pubkey);
  if (computedFp !== whoami.fingerprint) {
    throw new Error('Fingerprint mismatch');
  }

  return {
    name: whoami.device_name,
    fingerprint: whoami.fingerprint,
    host,
    port,
    pubkey: whoami.pubkey,
    isPaired: false,
  };
}

export function decryptIncomingShare(
  ciphertextB64: string,
  senderPubKey: string,
  recipientDevice: Device
): Entry | null {
  const plaintext = boxOpenBase64(ciphertextB64, senderPubKey, recipientDevice.privkey);

  if (!plaintext) {
    return null;
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}
