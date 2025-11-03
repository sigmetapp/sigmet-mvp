import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link, router } from 'expo-router';
import { signUp } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await signUp(email, password);
      if (error) throw error;
      
      Alert.alert(
        'Success',
        'Account created! Please check your email to verify your account.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(auth)/login'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Signup Failed', error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(isDark);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to get started</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={isDark ? '#999' : '#666'}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={isDark ? '#999' : '#666'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
            />

            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor={isDark ? '#999' : '#666'}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="password-new"
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <View style={styles.linkContainer}>
              <Text style={styles.linkText}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.link}>Sign In</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#0F1623' : '#FFFFFF',
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 20,
    },
    content: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: isDark ? '#FFFFFF' : '#000000',
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? '#999' : '#666',
      marginBottom: 32,
      textAlign: 'center',
    },
    form: {
      width: '100%',
    },
    input: {
      backgroundColor: isDark ? '#1A2332' : '#F5F5F5',
      color: isDark ? '#FFFFFF' : '#000000',
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? '#2A3441' : '#E0E0E0',
    },
    button: {
      backgroundColor: '#3390EC',
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    linkContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 16,
    },
    linkText: {
      color: isDark ? '#999' : '#666',
      fontSize: 14,
    },
    link: {
      color: '#3390EC',
      fontSize: 14,
      fontWeight: '600',
    },
  });
