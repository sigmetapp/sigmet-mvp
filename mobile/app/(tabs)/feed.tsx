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
import { PostCard } from '@/components/PostCard';

export default function FeedScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles(*)')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPosts();
  };

  const styles = createStyles(isDark);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Feed</Text>
      </View>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <PostCard post={item} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No posts yet</Text>
          </View>
        }
      />
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
    list: {
      padding: 16,
    },
    loadingText: {
      color: isDark ? '#FFFFFF' : '#000000',
      textAlign: 'center',
      marginTop: 32,
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
