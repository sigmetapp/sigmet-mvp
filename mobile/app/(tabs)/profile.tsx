import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { signOut } from '@/lib/auth';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LogOut, Settings, User } from 'lucide-react-native';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user, setUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setUser(null);
          router.replace('/(auth)/login');
        },
      },
    ]);
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
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
          {profile?.username && (
            <Text style={styles.username}>@{profile.username}</Text>
          )}
        </View>

        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem}>
            <User size={20} color={isDark ? '#FFFFFF' : '#000000'} />
            <Text style={styles.menuText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Settings size={20} color={isDark ? '#FFFFFF' : '#000000'} />
            <Text style={styles.menuText}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.logoutItem]}
            onPress={handleLogout}
          >
            <LogOut size={20} color="#FF3B30" />
            <Text style={[styles.menuText, styles.logoutText]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
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
    content: {
      padding: 16,
    },
    profileSection: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#3390EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    avatarText: {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    email: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
      marginBottom: 4,
    },
    username: {
      fontSize: 16,
      color: isDark ? '#999' : '#666',
    },
    menuSection: {
      marginTop: 32,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: isDark ? '#1A2332' : '#F5F5F5',
      borderRadius: 12,
      marginBottom: 12,
      gap: 12,
    },
    menuText: {
      fontSize: 16,
      color: isDark ? '#FFFFFF' : '#000000',
    },
    logoutItem: {
      backgroundColor: isDark ? '#2A1F1F' : '#FFF5F5',
    },
    logoutText: {
      color: '#FF3B30',
    },
    loadingText: {
      color: isDark ? '#FFFFFF' : '#000000',
      textAlign: 'center',
      marginTop: 32,
    },
  });
