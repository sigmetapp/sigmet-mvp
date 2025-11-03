import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Home, User, MessageSquare, Award } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function TabsLayout() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3390EC',
        tabBarInactiveTintColor: isDark ? '#666' : '#999',
        tabBarStyle: {
          backgroundColor: isDark ? '#1A2332' : '#FFFFFF',
          borderTopColor: isDark ? '#2A3441' : '#E0E0E0',
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dms"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <MessageSquare size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="badges"
        options={{
          title: 'Badges',
          tabBarIcon: ({ color, size }) => <Award size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
