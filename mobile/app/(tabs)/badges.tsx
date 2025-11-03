import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Award } from 'lucide-react-native';

export default function BadgesScreen() {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (user) {
      loadBadges();
    }
  }, [user]);

  const loadBadges = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_badges')
        .select('*, badge:badges(*)')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false });

      if (error) throw error;
      setBadges(data || []);
    } catch (error) {
      console.error('Error loading badges:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBadges();
  };

  const styles = createStyles(isDark);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Badges</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={badges}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.badgeCard}>
              <View style={styles.badgeIcon}>
                <Award size={32} color="#FFD700" />
              </View>
              <Text style={styles.badgeName}>
                {item.badge?.name || 'Unknown Badge'}
              </Text>
              {item.badge?.description && (
                <Text style={styles.badgeDescription} numberOfLines={2}>
                  {item.badge.description}
                </Text>
              )}
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No badges yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
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
    list: {
      padding: 16,
    },
    badgeCard: {
      flex: 1,
      backgroundColor: isDark ? '#1A2332' : '#F5F5F5',
      borderRadius: 12,
      padding: 16,
      margin: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#2A3441' : '#E0E0E0',
    },
    badgeIcon: {
      marginBottom: 12,
    },
    badgeName: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
      marginBottom: 8,
      textAlign: 'center',
    },
    badgeDescription: {
      fontSize: 12,
      color: isDark ? '#999' : '#666',
      textAlign: 'center',
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
}
