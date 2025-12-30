import Zeroconf from 'react-native-zeroconf';
import { NativeModules } from 'react-native';
import { Peer } from './types';
import { SERVICE_DOMAIN, SERVICE_PROTOCOL, SERVICE_TYPE } from './config';

type PeerCallback = (peer: Peer) => void;

class DiscoveryService {
  private zeroconf: Zeroconf;
  private myFingerprint: string = '';
  private peerCallback: PeerCallback | null = null;
  private isRunning: boolean = false;
  private warnedUnavailable: boolean = false;

  constructor() {
    this.zeroconf = new Zeroconf();
    this.setupListeners();
  }

  private isAvailable(): boolean {
    return !!NativeModules?.RNZeroconf;
  }

  private warnIfUnavailable(): void {
    if (this.warnedUnavailable) return;
    this.warnedUnavailable = true;
    console.warn('Zeroconf unavailable. Discovery is disabled (Expo Go or missing native module).');
  }

  private setupListeners(): void {
    this.zeroconf.on('resolved', (service: any) => {
      if (!this.peerCallback) return;

      const txtRecord = service.txt || {};
      const fingerprint = txtRecord.pkfp || '';

      if (!fingerprint || fingerprint === this.myFingerprint) return;

      const peer: Peer = {
        name: service.name || 'Unknown',
        fingerprint,
        host: service.host || service.addresses?.[0] || '',
        port: service.port || 8765,
        pubkey: '',
        isPaired: false,
      };

      if (peer.host) {
        this.peerCallback(peer);
      }
    });

    this.zeroconf.on('error', (err: any) => {
      console.warn('Zeroconf error:', err);
    });
  }

  start(fingerprint: string, deviceName: string, port: number, onPeerFound: PeerCallback): void {
    if (!this.isAvailable()) {
      this.warnIfUnavailable();
      return;
    }
    if (this.isRunning) return;

    this.myFingerprint = fingerprint;
    this.peerCallback = onPeerFound;
    this.isRunning = true;

    this.zeroconf.publishService(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN, deviceName, port, {
      pkfp: fingerprint,
      v: '1',
    });

    this.zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN);
  }

  stop(): void {
    if (!this.isAvailable()) {
      this.warnIfUnavailable();
      return;
    }
    if (!this.isRunning) return;

    this.zeroconf.unpublishService(this.myFingerprint);
    this.zeroconf.stop();
    this.isRunning = false;
    this.peerCallback = null;
  }

  refresh(): void {
    if (!this.isAvailable()) {
      this.warnIfUnavailable();
      return;
    }
    if (this.isRunning) {
      this.zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN);
    }
  }
}

export const discoveryService = new DiscoveryService();
