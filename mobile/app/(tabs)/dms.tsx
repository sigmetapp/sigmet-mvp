import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { MessageSquare } from 'lucide-react-native';

export default function DMsScreen() {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (user) {
      loadThreads();
    }
  }, [user]);

  const loadThreads = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('dm_threads')
        .select('*, participants:dm_participants(profile:profiles(*))')
        .eq('participants.user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setThreads(data || []);
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadThreads();
  };

  const styles = createStyles(isDark);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.threadItem}>
              <View style={styles.avatar}>
                <MessageSquare size={24} color="#3390EC" />
              </View>
              <View style={styles.threadInfo}>
                <Text style={styles.threadName}>
                  {item.thread_name || 'Conversation'}
                </Text>
                {item.last_message && (
                  <Text style={styles.lastMessage} numberOfLines={1}>
                    {item.last_message}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#0F1623' : '#FFFFFF',
    },
    header: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#2A3441' : '#E0E0E0',
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? '#FFFFFF' : '#000000',
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      color: isDark ? '#FFFFFF' : '#000000',
    },
    threadItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#2A3441' : '#E0E0E0',
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? '#1A2332' : '#F5F5F5',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    threadInfo: {
      flex: 1,
    },
    threadName: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
      marginBottom: 4,
    },
    lastMessage: {
      fontSize: 14,
      color: isDark ? '#999' : '#666',
    },
    emptyContainer: {
      padding: 32,
      alignItems: 'center',
    },
    emptyText: {
      color: isDark ? '#999' : '#666',
      fontSize: 16,
    },
  });
