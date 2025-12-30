import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { Friend } from '../../services/types';

const TAB_BAR_HEIGHT = Platform.select({ ios: 49, default: 56 }) ?? 56;

export default function FriendsScreen() {
  const { friends, deleteFriend, device } = useApp();
  const insets = useSafeAreaInsets();
  const listBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 16;

  const handleDelete = (friend: Friend) => {
    Alert.alert(
      'Remove Friend',
      `Remove "${friend.name}" from your friends list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteFriend(friend.fingerprint),
        },
      ]
    );
  };

  const formatFingerprint = (fp: string) => {
    const chunks = [];
    for (let i = 0; i < fp.length; i += 4) {
      chunks.push(fp.substring(i, i + 4));
    }
    return chunks.join(' ');
  };

  const renderFriend = ({ item }: { item: Friend }) => (
    <View style={styles.friendCard}>
      <View style={styles.friendIcon}>
        <Ionicons name="person" size={28} color="#89b4fa" />
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.name}</Text>
        <Text style={styles.friendFingerprint}>{formatFingerprint(item.fingerprint)}</Text>
        {item.last_addr && (
          <Text style={styles.friendAddress}>Last seen: {item.last_addr}</Text>
        )}
        <Text style={styles.friendAdded}>
          Added: {new Date(item.added_at).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
        <Ionicons name="trash-outline" size={22} color="#f38ba8" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {device && (
        <View style={styles.myDevice}>
          <View style={styles.myDeviceHeader}>
            <Ionicons name="phone-portrait" size={24} color="#89b4fa" />
            <Text style={styles.myDeviceTitle}>This Device</Text>
          </View>
          <Text style={styles.myDeviceName}>{device.name}</Text>
          <Text style={styles.myDeviceFingerprint}>
            {formatFingerprint(
              Array.from(atob(device.pubkey).slice(0, 8))
                .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('')
            )}
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Paired Devices ({friends.length})</Text>

      <FlatList
        data={friends}
        renderItem={renderFriend}
        keyExtractor={(item) => item.fingerprint}
        contentContainerStyle={[styles.list, { paddingBottom: listBottomPadding }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={64} color="#585b70" />
            <Text style={styles.emptyText}>No friends yet</Text>
            <Text style={styles.emptySubtext}>
              Pair with devices from the Nearby tab to share passwords
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
  myDevice: {
    backgroundColor: '#313244',
    padding: 16,
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#89b4fa',
  },
  myDeviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  myDeviceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#89b4fa',
    marginLeft: 8,
  },
  myDeviceName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#cdd6f4',
    marginBottom: 4,
  },
  myDeviceFingerprint: {
    fontSize: 12,
    color: '#a6adc8',
    fontFamily: 'monospace',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a6adc8',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
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
  friendIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#45475a',
    alignItems: 'center',
    justifyContent: 'center',
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
  friendFingerprint: {
    fontSize: 11,
    color: '#89b4fa',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  friendAddress: {
    fontSize: 12,
    color: '#6c7086',
    marginTop: 2,
  },
  friendAdded: {
    fontSize: 11,
    color: '#7f849c',
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
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
