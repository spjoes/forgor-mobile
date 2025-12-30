import nacl from 'tweetnacl';
import { base64ToBytes, bytesToBase64 } from './types';

const SALT_SIZE = 16;
const NONCE_SIZE = 24;

const ARGON2_ITERATIONS = 3;
const ARGON2_MEMORY = 64 * 1024;
const ARGON2_PARALLELISM = 4;
const ARGON2_HASH_LENGTH = 32;

let argon2: ((password: string, salt: string, config: object) => Promise<{ rawHash: string }>) | null = null;
let argon2Warned = false;

try {
  argon2 = require('react-native-argon2').default;
} catch { }

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

export async function generateSalt(): Promise<Uint8Array> {
  return nacl.randomBytes(SALT_SIZE);
}

async function deriveKeyFallback(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);
  const combined = new Uint8Array(passwordBytes.length + salt.length);
  combined.set(passwordBytes);
  combined.set(salt, passwordBytes.length);

  const hash1 = nacl.hash(combined);
  const hash2 = nacl.hash(hash1);
  const hash3 = nacl.hash(hash2);

  return hash3.slice(0, 32);
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (argon2) {
    try {
      const saltHex = bytesToHex(salt);
      const result = await argon2(password, saltHex, {
        iterations: ARGON2_ITERATIONS,
        memory: ARGON2_MEMORY,
        parallelism: ARGON2_PARALLELISM,
        hashLength: ARGON2_HASH_LENGTH,
        mode: 'argon2id',
        saltEncoding: 'hex',
      });
      return hexToBytes(result.rawHash);
    } catch (error) {
      if (!argon2Warned) {
        console.warn('Argon2id failed, falling back to hash-based KDF:', error);
        argon2Warned = true;
      }
      return deriveKeyFallback(password, salt);
    }
  }

  if (!argon2Warned) {
    console.warn(
      'Argon2id unavailable. Using simplified hash-based KDF (Expo Go or missing native module).'
    );
    argon2Warned = true;
  }
  return deriveKeyFallback(password, salt);
}

export function encrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = nacl.randomBytes(NONCE_SIZE);
  const ciphertext = nacl.secretbox(plaintext, nonce, key);

  const result = new Uint8Array(nonce.length + ciphertext.length);
  result.set(nonce);
  result.set(ciphertext, nonce.length);

  return result;
}

export function decrypt(key: Uint8Array, ciphertext: Uint8Array): Uint8Array | null {
  if (ciphertext.length < NONCE_SIZE) {
    return null;
  }

  const nonce = ciphertext.slice(0, NONCE_SIZE);
  const encrypted = ciphertext.slice(NONCE_SIZE);

  return nacl.secretbox.open(encrypted, nonce, key);
}

export function generateBoxKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return nacl.box.keyPair();
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

export function boxSealBase64(
  message: Uint8Array,
  recipientPubKeyBase64: string,
  senderPrivKeyBase64: string
): string {
  const recipientPubKey = base64ToBytes(recipientPubKeyBase64);
  const senderPrivKey = base64ToBytes(senderPrivKeyBase64);
  const sealed = boxSeal(message, recipientPubKey, senderPrivKey);
  return bytesToBase64(sealed);
}

export function boxOpenBase64(
  ciphertextBase64: string,
  senderPubKeyBase64: string,
  recipientPrivKeyBase64: string
): Uint8Array | null {
  const ciphertext = base64ToBytes(ciphertextBase64);
  const senderPubKey = base64ToBytes(senderPubKeyBase64);
  const recipientPrivKey = base64ToBytes(recipientPrivKeyBase64);
  return boxOpen(ciphertext, senderPubKey, recipientPrivKey);
}
