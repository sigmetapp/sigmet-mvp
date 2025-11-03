import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDistanceToNow } from 'date-fns';

interface PostCardProps {
  post: any;
}

export function PostCard({ post }: PostCardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const styles = createStyles(isDark);
  const profile = post.profiles || {};
  const createdAt = post.created_at
    ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
    : '';

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile.username?.[0]?.toUpperCase() ||
              profile.email?.[0]?.toUpperCase() ||
              'U'}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.username}>
            {profile.username || profile.email || 'Unknown'}
          </Text>
          <Text style={styles.time}>{createdAt}</Text>
        </View>
      </View>

      {post.content && (
        <Text style={styles.content}>{post.content}</Text>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>Like</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>Comment</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? '#1A2332' : '#FFFFFF',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? '#2A3441' : '#E0E0E0',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#3390EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    userInfo: {
      flex: 1,
    },
    username: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
      marginBottom: 2,
    },
    time: {
      fontSize: 12,
      color: isDark ? '#999' : '#666',
    },
    content: {
      fontSize: 16,
      color: isDark ? '#FFFFFF' : '#000000',
      lineHeight: 24,
      marginBottom: 12,
    },
    footer: {
      flexDirection: 'row',
      gap: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#2A3441' : '#E0E0E0',
    },
    actionButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    actionText: {
      fontSize: 14,
      color: '#3390EC',
      fontWeight: '600',
    },
  });
