import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3390EC" />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/feed" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1623',
  },
});
