import nacl from 'tweetnacl';
import { base64ToBytes, bytesToBase64 } from './types';

const SALT_SIZE = 16;
const NONCE_SIZE = 24;

export async function generateSalt(): Promise<Uint8Array> {
  return nacl.randomBytes(SALT_SIZE);
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);
  const combined = new Uint8Array(passwordBytes.length + salt.length);
  combined.set(passwordBytes);
  combined.set(salt, passwordBytes.length);
  
  const hash1 = nacl.hash(combined);
  const hash2 = nacl.hash(hash1);
  const hash3 = nacl.hash(hash2);
  
  return hash3.slice(0, 32);
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
