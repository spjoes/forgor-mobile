import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Friend } from '../services/types';
import { sendShare } from '../services/sharing';

export default function ShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ entryId: string }>();
  const { entries, friends, device, peers } = useApp();
  const [loading, setLoading] = useState<string | null>(null);

  const entry = entries.find((e) => e.id === params.entryId);

  if (!entry) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Entry not found</Text>
      </View>
    );
  }

  const handleShare = async (friend: Friend) => {
    if (!device) {
      Alert.alert('Error', 'Device not available');
      return;
    }

    const peer = peers.get(friend.fingerprint);
    const address = peer ? `${peer.host}:${peer.port}` : friend.last_addr;

    if (!address) {
      Alert.alert('Error', 'No address available for this friend. They need to be online.');
      return;
    }

    const [host, portStr] = address.split(':');
    const port = parseInt(portStr, 10) || 8765;

    setLoading(friend.fingerprint);
    try {
      await sendShare(host, port, entry, device, friend.pubkey);
      Alert.alert('Success', `Password shared with ${friend.name}`);
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to share password');
    } finally {
      setLoading(null);
    }
  };

  const renderFriend = ({ item }: { item: Friend }) => {
    const isOnline = peers.has(item.fingerprint);
    const isLoading = loading === item.fingerprint;

    return (
      <TouchableOpacity
        style={[styles.friendCard, !isOnline && styles.friendOffline]}
        onPress={() => handleShare(item)}
        disabled={isLoading}
      >
        <View style={[styles.friendIcon, isOnline && styles.friendIconOnline]}>
          <Ionicons name="person" size={24} color={isOnline ? '#a6e3a1' : '#6c7086'} />
        </View>
        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{item.name}</Text>
          <Text style={[styles.friendStatus, isOnline && styles.friendStatusOnline]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
        {isLoading ? (
          <ActivityIndicator size="small" color="#a6e3a1" />
        ) : (
          <Ionicons name="send" size={22} color="#89b4fa" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#cdd6f4" />
        </TouchableOpacity>
        <Text style={styles.title}>Share Password</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.entryPreview}>
        <Ionicons name="lock-closed" size={24} color="#89b4fa" />
        <View style={styles.entryInfo}>
          <Text style={styles.entryWebsite}>{entry.website}</Text>
          <Text style={styles.entryUsername}>{entry.username}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Select a friend to share with</Text>

      <FlatList
        data={friends}
        renderItem={renderFriend}
        keyExtractor={(item) => item.fingerprint}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={64} color="#585b70" />
            <Text style={styles.emptyText}>No friends to share with</Text>
            <Text style={styles.emptySubtext}>
              Pair with devices from the Nearby tab first
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#313244',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#cdd6f4',
  },
  placeholder: {
    width: 44,
  },
  entryPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#89b4fa',
  },
  entryInfo: {
    marginLeft: 12,
    flex: 1,
  },
  entryWebsite: {
    fontSize: 18,
    fontWeight: '600',
    color: '#cdd6f4',
  },
  entryUsername: {
    fontSize: 14,
    color: '#a6adc8',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a6adc8',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  friendOffline: {
    opacity: 0.6,
  },
  friendIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#45475a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendIconOnline: {
    borderWidth: 2,
    borderColor: '#a6e3a1',
  },
  friendInfo: {
    flex: 1,
    marginLeft: 12,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#cdd6f4',
  },
  friendStatus: {
    fontSize: 12,
    color: '#6c7086',
    marginTop: 2,
  },
  friendStatusOnline: {
    color: '#a6e3a1',
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
  errorText: {
    color: '#f38ba8',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
});
