declare module 'react-native-zeroconf' {
  import { EventEmitter } from 'events';

  interface Service {
    host: string;
    port: number;
    name: string;
    fullName: string;
    addresses: string[];
    txt: Record<string, string>;
  }

  class Zeroconf extends EventEmitter {
    constructor();
    
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    
    getServices(): Record<string, Service>;
    
    publishService(
      type: string,
      protocol: string,
      domain: string,
      name: string,
      port: number,
      txt?: Record<string, string>
    ): void;
    
    unpublishService(name: string): void;

    on(event: 'start', listener: () => void): this;
    on(event: 'stop', listener: () => void): this;
    on(event: 'found', listener: (name: string) => void): this;
    on(event: 'resolved', listener: (service: Service) => void): this;
    on(event: 'remove', listener: (name: string) => void): this;
    on(event: 'update', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  export default Zeroconf;
}
