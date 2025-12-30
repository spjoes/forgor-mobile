import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Network from 'expo-network';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { Friend, Peer } from '../../services/types';
import { fetchAndPair } from '../../services/sharing';
import { SERVICE_PORT } from '../../services/config';
import { httpServer, ServerStatus } from '../../services/httpServer';

const TAB_BAR_HEIGHT = Platform.select({ ios: 49, default: 56 }) ?? 56;

export default function NearbyScreen() {
  const { peers, addFriend, refreshPeers, device, isUnlocked } = useApp();
  const [manualAddress, setManualAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [localAddress, setLocalAddress] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus>(() => httpServer.getStatus());
  const insets = useSafeAreaInsets();
  const listBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 16;

  const loadLocalAddress = useCallback(async () => {
    try {
      const ip = await Network.getIpAddressAsync();
      if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1') {
        setLocalAddress(null);
        return;
      }
      setLocalAddress(ip);
    } catch {
      setLocalAddress(null);
    }
  }, []);

  useEffect(() => {
    loadLocalAddress();
  }, [loadLocalAddress]);

  useEffect(() => {
    setServerStatus(httpServer.getStatus());
  }, [isUnlocked]);

  const handleRefresh = () => {
    refreshPeers();
    loadLocalAddress();
    setServerStatus(httpServer.getStatus());
  };

  const statusPresentation = useMemo(() => {
    const connectable = isUnlocked && serverStatus.state === 'running';
    let label = 'Not connectable';
    let detail = serverStatus.detail;
    let color = '#f38ba8';

    if (connectable) {
      label = 'Connectable';
      detail = 'This device can accept incoming pairing and shares.';
      color = '#a6e3a1';
    } else if (serverStatus.state === 'unavailable') {
      label = 'Unavailable';
      color = '#9399b2';
    } else if (serverStatus.state === 'error') {
      label = 'Error';
    } else if (!isUnlocked) {
      label = 'Locked';
      detail = 'Unlock the vault to enable incoming pairing and shares.';
      color = '#9399b2';
    }

    return { label, detail, color };
  }, [isUnlocked, serverStatus]);

  const handleStatusPress = () => {
    Alert.alert(statusPresentation.label, statusPresentation.detail);
  };

  const peerList = Array.from(peers.values());

  const handlePair = async (peer: Peer) => {
    if (peer.isPaired) {
      Alert.alert('Already Paired', `${peer.name} is already in your friends list`);
      return;
    }

    if (!peer.pubkey) {
      setLoading(true);
      try {
        const fetchedPeer = await fetchAndPair(`${peer.host}:${peer.port}`);
        const friend: Friend = {
          fingerprint: fetchedPeer.fingerprint,
          name: fetchedPeer.name,
          pubkey: fetchedPeer.pubkey,
          added_at: new Date().toISOString(),
          last_addr: `${fetchedPeer.host}:${fetchedPeer.port}`,
        };
        await addFriend(friend);
        Alert.alert('Paired!', `${friend.name} has been added to your friends`);
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to pair with device');
      } finally {
        setLoading(false);
      }
      return;
    }

    const friend: Friend = {
      fingerprint: peer.fingerprint,
      name: peer.name,
      pubkey: peer.pubkey,
      added_at: new Date().toISOString(),
      last_addr: `${peer.host}:${peer.port}`,
    };

    try {
      await addFriend(friend);
      Alert.alert('Paired!', `${friend.name} has been added to your friends`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add friend');
    }
  };

  const handleManualPair = async () => {
    if (!manualAddress.trim()) {
      Alert.alert('Error', 'Please enter an IP address');
      return;
    }

    setLoading(true);
    try {
      const peer = await fetchAndPair(manualAddress.trim());
      const friend: Friend = {
        fingerprint: peer.fingerprint,
        name: peer.name,
        pubkey: peer.pubkey,
        added_at: new Date().toISOString(),
        last_addr: `${peer.host}:${peer.port}`,
      };
      await addFriend(friend);
      Alert.alert('Paired!', `${friend.name} has been added to your friends`);
      setManualAddress('');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to connect to device');
    } finally {
      setLoading(false);
    }
  };

  const renderPeer = ({ item }: { item: Peer }) => (
    <TouchableOpacity
      style={[styles.peerCard, item.isPaired && styles.peerCardPaired]}
      onPress={() => handlePair(item)}
    >
      <View style={styles.peerIcon}>
        <Ionicons
          name={item.isPaired ? 'checkmark-circle' : 'laptop-outline'}
          size={32}
          color={item.isPaired ? '#a6e3a1' : '#9399b2'}
        />
      </View>
      <View style={styles.peerInfo}>
        <Text style={styles.peerName}>{item.name}</Text>
        <Text style={styles.peerFingerprint}>
          {item.fingerprint.substring(0, 4)} {item.fingerprint.substring(4, 8)}...
        </Text>
        <Text style={styles.peerAddress}>
          {item.host}:{item.port}
        </Text>
      </View>
      {item.isPaired ? (
        <Ionicons name="checkmark-circle" size={24} color="#a6e3a1" />
      ) : (
        <Ionicons name="add-circle-outline" size={24} color="#89b4fa" />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.deviceInfo}>
          <Ionicons name="phone-portrait-outline" size={24} color="#89b4fa" />
          <View style={styles.deviceText}>
            <Text style={styles.deviceName}>{device?.name || 'Unknown Device'}</Text>
            <Text style={styles.deviceAddress}>
              {localAddress ? `${localAddress}:${SERVICE_PORT}` : 'IP unavailable'}
            </Text>
            <TouchableOpacity
              style={styles.statusPill}
              onPress={handleStatusPress}
              accessibilityRole="button"
            >
              <View style={[styles.statusDot, { backgroundColor: statusPresentation.color }]} />
              <Text style={[styles.statusText, { color: statusPresentation.color }]}>
                {statusPresentation.label}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color="#cdd6f4" />
        </TouchableOpacity>
      </View>

      <View style={styles.manualSection}>
        <Text style={styles.sectionTitle}>Manual Connect</Text>
        <View style={styles.manualInput}>
          <TextInput
            style={styles.addressInput}
            placeholder="IP:Port (e.g., 192.168.1.100:8765)"
            placeholderTextColor="#6c7086"
            value={manualAddress}
            onChangeText={setManualAddress}
            keyboardType="numbers-and-punctuation"
          />
          <TouchableOpacity
            style={styles.connectButton}
            onPress={handleManualPair}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#1e1e2e" />
            ) : (
              <Ionicons name="arrow-forward" size={20} color="#1e1e2e" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Nearby Devices</Text>

      <FlatList
        data={peerList}
        renderItem={renderPeer}
        keyExtractor={(item) => item.fingerprint}
        contentContainerStyle={[styles.list, { paddingBottom: listBottomPadding }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="wifi-outline" size={64} color="#585b70" />
            <Text style={styles.emptyText}>No devices found</Text>
            <Text style={styles.emptySubtext}>
              Make sure other Forgor devices are on the same network
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#313244',
    borderBottomWidth: 1,
    borderBottomColor: '#45475a',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceText: {
    marginLeft: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#cdd6f4',
  },
  deviceAddress: {
    fontSize: 12,
    color: '#a6adc8',
    marginTop: 2,
  },
  statusPill: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  refreshButton: {
    padding: 8,
  },
  manualSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#313244',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a6adc8',
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  manualInput: {
    flexDirection: 'row',
    gap: 8,
  },
  addressInput: {
    flex: 1,
    backgroundColor: '#313244',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#cdd6f4',
  },
  connectButton: {
    backgroundColor: '#89b4fa',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  peerCardPaired: {
    borderWidth: 1,
    borderColor: '#a6e3a1',
  },
  peerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#45475a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  peerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#cdd6f4',
  },
  peerFingerprint: {
    fontSize: 12,
    color: '#89b4fa',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  peerAddress: {
    fontSize: 12,
    color: '#6c7086',
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#6c7086',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#7f849c',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
