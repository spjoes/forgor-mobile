import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { Entry } from '../../services/types';

const TAB_BAR_HEIGHT = Platform.select({ ios: 49, default: 56 }) ?? 56;
const FAB_SIZE = 56;
const FAB_MARGIN = 24;

export default function VaultScreen() {
  const router = useRouter();
  const {
    entries,
    deleteEntry,
    lock,
    pendingShares,
    acceptShare,
    rejectShare,
    syncSchemeCutover,
    syncEntrySchemes,
  } = useApp();
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();
  const tabBarSpace = TAB_BAR_HEIGHT + insets.bottom;
  const listBottomPadding = tabBarSpace + FAB_MARGIN + FAB_SIZE;
  const bottomButtonsOffset = tabBarSpace + FAB_MARGIN;

  const filteredEntries = entries.filter(
    (e) =>
      e.website.toLowerCase().includes(search.toLowerCase()) ||
      e.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopyPassword = async (entry: Entry) => {
    await Clipboard.setStringAsync(entry.password);
    Alert.alert('Copied', 'Password copied to clipboard');
  };

  const handleCopyUsername = async (entry: Entry) => {
    await Clipboard.setStringAsync(entry.username);
    Alert.alert('Copied', 'Username copied to clipboard');
  };

  const handleDelete = (entry: Entry) => {
    Alert.alert('Delete Entry', `Delete "${entry.website}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteEntry(entry.id),
      },
    ]);
  };

  const handleAcceptShare = (share: typeof pendingShares[0]) => {
    Alert.alert(
      'Accept Password',
      `Accept "${share.entry.website}" from ${share.fromName}?`,
      [
        { text: 'Reject', style: 'destructive', onPress: () => rejectShare(share) },
        { text: 'Accept', onPress: () => acceptShare(share) },
      ]
    );
  };

  const getEntryScheme = (entry: Entry): 'legacy' | 'v2' => {
    const mapped = syncEntrySchemes[entry.id];
    if (mapped === 'v2' || mapped === 'legacy') {
      return mapped;
    }
    if (!syncSchemeCutover) return 'legacy';
    const updatedAt = new Date(entry.updated_at);
    if (Number.isNaN(updatedAt.getTime())) return 'legacy';
    return updatedAt >= syncSchemeCutover ? 'v2' : 'legacy';
  };

  const renderEntry = ({ item }: { item: Entry }) => (
    <TouchableOpacity
      style={styles.entryCard}
      onPress={() => router.push({ pathname: '/entry', params: { id: item.id } })}
      onLongPress={() => handleCopyPassword(item)}
    >
      <View style={styles.entryHeader}>
        <View style={styles.entryTitleRow}>
          <Text style={styles.entryWebsite}>{item.website}</Text>
          <Text
            style={[
              styles.schemeBadge,
              getEntryScheme(item) === 'v2' ? styles.schemeBadgeV2 : styles.schemeBadgeLegacy,
            ]}
          >
            {getEntryScheme(item)}
          </Text>
        </View>
        <View style={styles.entryActions}>
          <TouchableOpacity onPress={() => handleCopyUsername(item)} style={styles.iconButton}>
            <Ionicons name="person-outline" size={20} color="#7f849c" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleCopyPassword(item)} style={styles.iconButton}>
            <Ionicons name="copy-outline" size={20} color="#7f849c" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/share', params: { entryId: item.id } })}
            style={styles.iconButton}
          >
            <Ionicons name="share-outline" size={20} color="#7f849c" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconButton}>
            <Ionicons name="trash-outline" size={20} color="#f38ba8" />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.entryUsername}>{item.username}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {pendingShares.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={styles.pendingTitle}>Incoming Shares</Text>
          {pendingShares.map((share, index) => (
            <TouchableOpacity
              key={index}
              style={styles.pendingCard}
              onPress={() => handleAcceptShare(share)}
            >
              <Ionicons name="download-outline" size={24} color="#89b4fa" />
              <View style={styles.pendingInfo}>
                <Text style={styles.pendingWebsite}>{share.entry.website}</Text>
                <Text style={styles.pendingFrom}>From: {share.fromName}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6c7086" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search passwords..."
          placeholderTextColor="#6c7086"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filteredEntries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: listBottomPadding }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="lock-open-outline" size={64} color="#585b70" />
            <Text style={styles.emptyText}>No passwords yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first entry</Text>
          </View>
        }
      />

      <View style={[styles.bottomButtons, { bottom: bottomButtonsOffset }]}>
        <TouchableOpacity style={styles.lockButton} onPress={lock}>
          <Ionicons name="lock-closed" size={24} color="#cdd6f4" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/entry')}
        >
          <Ionicons name="add" size={32} color="#1e1e2e" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2e',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#cdd6f4',
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  entryCard: {
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  entryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  entryWebsite: {
    fontSize: 18,
    fontWeight: '600',
    color: '#cdd6f4',
  },
  schemeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  schemeBadgeLegacy: {
    color: '#fab387',
    borderColor: '#fab387',
    backgroundColor: 'rgba(250, 179, 135, 0.15)',
  },
  schemeBadgeV2: {
    color: '#a6e3a1',
    borderColor: '#a6e3a1',
    backgroundColor: 'rgba(166, 227, 161, 0.15)',
  },
  entryActions: {
    flexDirection: 'row',
  },
  iconButton: {
    padding: 8,
    marginLeft: 4,
  },
  entryUsername: {
    fontSize: 14,
    color: '#a6adc8',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 20,
    color: '#6c7086',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#7f849c',
    marginTop: 8,
  },
  bottomButtons: {
    position: 'absolute',
    right: 24,
    flexDirection: 'row',
    gap: 12,
  },
  lockButton: {
    backgroundColor: '#45475a',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addButton: {
    backgroundColor: '#89b4fa',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  pendingSection: {
    backgroundColor: '#313244',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#45475a',
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#89b4fa',
    marginBottom: 12,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  pendingInfo: {
    marginLeft: 12,
    flex: 1,
  },
  pendingWebsite: {
    fontSize: 16,
    fontWeight: '500',
    color: '#cdd6f4',
  },
  pendingFrom: {
    fontSize: 12,
    color: '#a6adc8',
    marginTop: 2,
  },
});
