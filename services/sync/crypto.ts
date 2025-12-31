import nacl from 'tweetnacl';
import * as Crypto from 'expo-crypto';
import { sha256 as jsSha256 } from 'js-sha256';
import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305';
import { base64ToBytes, bytesToBase64 } from '../types';

const NONCE_SIZE = 24;

export function generateSignKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return nacl.sign.keyPair();
}

export function generateBoxKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return nacl.box.keyPair();
}

export function sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

export function verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey);
}

export function sha256(data: Uint8Array): Uint8Array {
  const hash = jsSha256.create();
  hash.update(data);
  return new Uint8Array(hash.array());
}

export async function sha256Async(data: Uint8Array): Promise<Uint8Array> {
  const result = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data as unknown as ArrayBuffer
  );
  return new Uint8Array(result);
}

function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (bytes.buffer instanceof ArrayBuffer) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) as Uint8Array<ArrayBuffer>;
  }
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const hmac = jsSha256.hmac.create(key);
  hmac.update(data);
  return new Uint8Array(hmac.array());
}

function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Uint8Array {
  const safeSalt = salt.length ? salt : new Uint8Array(32);
  const prk = hmacSha256(safeSalt, ikm);
  const okm = new Uint8Array(length);
  let t: Uint8Array = new Uint8Array(0);
  let offset = 0;
  let counter = 1;

  while (offset < length) {
    const input = new Uint8Array(t.length + info.length + 1);
    input.set(t);
    input.set(info, t.length);
    input[input.length - 1] = counter;

    t = hmacSha256(prk, input);
    const take = Math.min(t.length, length - offset);
    okm.set(t.slice(0, take), offset);
    offset += take;
    counter += 1;
  }

  return okm;
}

export function boxSeal(
  message: Uint8Array,
  recipientPubKey: Uint8Array,
  senderPrivKey: Uint8Array
): Uint8Array {
  const nonce = nacl.randomBytes(NONCE_SIZE);
  const ciphertext = nacl.box(message, nonce, recipientPubKey, senderPrivKey);

  const result = new Uint8Array(nonce.length + ciphertext.length);
  result.set(nonce);
  result.set(ciphertext, nonce.length);

  return result;
}

export function boxOpen(
  ciphertext: Uint8Array,
  senderPubKey: Uint8Array,
  recipientPrivKey: Uint8Array
): Uint8Array | null {
  if (ciphertext.length < NONCE_SIZE) {
    return null;
  }

  const nonce = ciphertext.slice(0, NONCE_SIZE);
  const encrypted = ciphertext.slice(NONCE_SIZE);

  return nacl.box.open(encrypted, nonce, senderPubKey, recipientPrivKey);
}

export function computeDeviceId(pubkeySign: Uint8Array): string {
  const hash = sha256(pubkeySign);
  return bytesToHex(hash);
}

export function deriveEventKey(vaultKey: Uint8Array, keyEpoch: number): Uint8Array {
  const info = new TextEncoder().encode(`forgor-event-key-epoch-${keyEpoch}`);
  return hkdfSha256(vaultKey, new Uint8Array(0), info, 32);
}

export function deriveLegacyEventKey(vaultKey: Uint8Array, keyEpoch: number): Uint8Array {
  const info = new TextEncoder().encode(`forgor-event-key-epoch-${keyEpoch}`);
  const combined = new Uint8Array(vaultKey.length + info.length);
  combined.set(vaultKey);
  combined.set(info, vaultKey.length);
  return sha256(combined);
}

export function secretboxEncrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = nacl.randomBytes(NONCE_SIZE);
  const ciphertext = nacl.secretbox(plaintext, nonce, key);

  const result = new Uint8Array(nonce.length + ciphertext.length);
  result.set(nonce);
  result.set(ciphertext, nonce.length);

  return result;
}

export function secretboxDecrypt(key: Uint8Array, ciphertext: Uint8Array): Uint8Array | null {
  if (ciphertext.length < NONCE_SIZE) {
    return null;
  }

  const nonce = ciphertext.slice(0, NONCE_SIZE);
  const encrypted = ciphertext.slice(NONCE_SIZE);

  return nacl.secretbox.open(encrypted, nonce, key);
}

export function secretboxEncryptBase64(
  key: Uint8Array,
  plaintext: Uint8Array
): string {
  const encrypted = secretboxEncrypt(key, plaintext);
  return bytesToBase64(encrypted);
}

export function secretboxDecryptBase64(
  key: Uint8Array,
  ciphertextBase64: string
): Uint8Array | null {
  const ciphertext = base64ToBytes(ciphertextBase64);
  return secretboxDecrypt(key, ciphertext);
}

export function xchacha20poly1305Encrypt(
  key: Uint8Array,
  plaintext: Uint8Array
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const nonce = nacl.randomBytes(NONCE_SIZE);
  const keyBytes = toArrayBufferBytes(key);
  const nonceBytes = toArrayBufferBytes(nonce);
  const plaintextBytes = toArrayBufferBytes(plaintext);
  const aead = new XChaCha20Poly1305(keyBytes);
  const ciphertext = aead.seal(nonceBytes, plaintextBytes);
  return { nonce: nonceBytes, ciphertext };
}

export function xchacha20poly1305Decrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array
): Uint8Array | null {
  if (nonce.length !== NONCE_SIZE) {
    return null;
  }
  const keyBytes = toArrayBufferBytes(key);
  const nonceBytes = toArrayBufferBytes(nonce);
  const ciphertextBytes = toArrayBufferBytes(ciphertext);
  const aead = new XChaCha20Poly1305(keyBytes);
  return aead.open(nonceBytes, ciphertextBytes) ?? null;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
