import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Entry, Friend, Device, Peer, IncomingShare } from '../services/types';
import { vaultStore } from '../services/storage';
import { discoveryService } from '../services/discovery';
import { httpServer } from '../services/httpServer';
import { SERVICE_PORT } from '../services/config';

interface AppState {
  isInitialized: boolean;
  isUnlocked: boolean;
  entries: Entry[];
  friends: Friend[];
  device: Device | null;
  peers: Map<string, Peer>;
  pendingShares: IncomingShare[];
}

interface AppContextType extends AppState {
  initialize: (password: string, deviceName: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  addEntry: (entry: Entry) => Promise<void>;
  updateEntry: (entry: Entry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  addFriend: (friend: Friend) => Promise<void>;
  deleteFriend: (fingerprint: string) => Promise<void>;
  refreshPeers: () => void;
  addPendingShare: (share: IncomingShare) => void;
  acceptShare: (share: IncomingShare) => Promise<void>;
  rejectShare: (share: IncomingShare) => void;
  checkInitialized: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    isInitialized: false,
    isUnlocked: false,
    entries: [],
    friends: [],
    device: null,
    peers: new Map(),
    pendingShares: [],
  });

  const checkInitialized = useCallback(async () => {
    const initialized = await vaultStore.isInitialized();
    setState((prev) => ({ ...prev, isInitialized: initialized }));
  }, []);

  useEffect(() => {
    checkInitialized();
  }, [checkInitialized]);

  const addPendingShare = useCallback((share: IncomingShare) => {
    setState((prev) => ({
      ...prev,
      pendingShares: [...prev.pendingShares, share],
    }));
  }, []);

  const initialize = useCallback(async (password: string, deviceName: string) => {
    await vaultStore.initialize(password, deviceName);
    const device = await vaultStore.getDevice();
    setState((prev) => ({
      ...prev,
      isInitialized: true,
      isUnlocked: true,
      entries: [],
      friends: [],
      device,
    }));

    if (device) {
      httpServer.start(SERVICE_PORT, addPendingShare);
      const fingerprint = vaultStore.getDeviceFingerprint(device);
      discoveryService.start(fingerprint, device.name, SERVICE_PORT, (peer) => {
        setState((prev) => {
          const newPeers = new Map(prev.peers);
          const existingFriend = prev.friends.find((f) => f.fingerprint === peer.fingerprint);
          peer.isPaired = !!existingFriend;
          newPeers.set(peer.fingerprint, peer);
          return { ...prev, peers: newPeers };
        });
      });
    }
  }, [addPendingShare]);

  const unlock = useCallback(async (password: string) => {
    const entries = await vaultStore.unlock(password);
    const device = await vaultStore.getDevice();
    const friends = await vaultStore.getAllFriends();

    setState((prev) => ({
      ...prev,
      isUnlocked: true,
      entries,
      friends,
      device,
    }));

    if (device) {
      httpServer.start(SERVICE_PORT, addPendingShare);
      const fingerprint = vaultStore.getDeviceFingerprint(device);
      discoveryService.start(fingerprint, device.name, SERVICE_PORT, (peer) => {
        setState((prev) => {
          const newPeers = new Map(prev.peers);
          const existingFriend = prev.friends.find((f) => f.fingerprint === peer.fingerprint);
          peer.isPaired = !!existingFriend;
          newPeers.set(peer.fingerprint, peer);
          return { ...prev, peers: newPeers };
        });
      });
    }
  }, [addPendingShare]);

  const lock = useCallback(() => {
    vaultStore.lock();
    httpServer.stop();
    discoveryService.stop();
    setState((prev) => ({
      ...prev,
      isUnlocked: false,
      entries: [],
      friends: [],
      device: null,
      peers: new Map(),
      pendingShares: [],
    }));
  }, []);

  const addEntry = useCallback(async (entry: Entry) => {
    const newEntries = [...state.entries, entry];
    await vaultStore.saveEntries(newEntries);
    setState((prev) => ({ ...prev, entries: newEntries }));
  }, [state.entries]);

  const updateEntry = useCallback(async (entry: Entry) => {
    const newEntries = state.entries.map((e) => (e.id === entry.id ? entry : e));
    await vaultStore.saveEntries(newEntries);
    setState((prev) => ({ ...prev, entries: newEntries }));
  }, [state.entries]);

  const deleteEntry = useCallback(async (id: string) => {
    const newEntries = state.entries.filter((e) => e.id !== id);
    await vaultStore.saveEntries(newEntries);
    setState((prev) => ({ ...prev, entries: newEntries }));
  }, [state.entries]);

  const addFriend = useCallback(async (friend: Friend) => {
    await vaultStore.saveFriend(friend);
    const friends = await vaultStore.getAllFriends();
    setState((prev) => {
      const newPeers = new Map(prev.peers);
      const peer = newPeers.get(friend.fingerprint);
      if (peer) {
        peer.isPaired = true;
        newPeers.set(friend.fingerprint, peer);
      }
      return { ...prev, friends, peers: newPeers };
    });
  }, []);

  const deleteFriend = useCallback(async (fingerprint: string) => {
    await vaultStore.deleteFriend(fingerprint);
    const friends = await vaultStore.getAllFriends();
    setState((prev) => {
      const newPeers = new Map(prev.peers);
      const peer = newPeers.get(fingerprint);
      if (peer) {
        peer.isPaired = false;
        newPeers.set(fingerprint, peer);
      }
      return { ...prev, friends, peers: newPeers };
    });
  }, []);

  const refreshPeers = useCallback(() => {
    discoveryService.refresh();
  }, []);

  const acceptShare = useCallback(async (share: IncomingShare) => {
    const newEntries = [...state.entries, share.entry];
    await vaultStore.saveEntries(newEntries);
    setState((prev) => ({
      ...prev,
      entries: newEntries,
      pendingShares: prev.pendingShares.filter((s) => s !== share),
    }));
  }, [state.entries]);

  const rejectShare = useCallback((share: IncomingShare) => {
    setState((prev) => ({
      ...prev,
      pendingShares: prev.pendingShares.filter((s) => s !== share),
    }));
  }, []);

  return (
    <AppContext.Provider
      value={{
        ...state,
        initialize,
        unlock,
        lock,
        addEntry,
        updateEntry,
        deleteEntry,
        addFriend,
        deleteFriend,
        refreshPeers,
        addPendingShare,
        acceptShare,
        rejectShare,
        checkInitialized,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
