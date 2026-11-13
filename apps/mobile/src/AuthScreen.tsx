import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Account, AuthService } from '@manage-expenses/core';
import { Button, Field } from './ui';
import { styles } from './styles';

interface AuthScreenProps {
  auth: AuthService;
  onAuthenticated: (user: Account) => void;
}

export function AuthScreen({ auth, onAuthenticated }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setIsBusy(true);
    try {
      const user = isRegister
        ? await auth.register({ firstName, lastName, username, password })
        : await auth.login(username, password);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 40 }}>
      <Text style={styles.title}>Manage Expenses</Text>
      <Text style={styles.h2}>{isRegister ? 'Create account' : 'Sign in'}</Text>
      {isRegister && (
        <>
          <Field label="First name" value={firstName} onChangeText={setFirstName} />
          <Field label="Last name" value={lastName} onChangeText={setLastName} />
        </>
      )}
      <Field label="Username" autoCapitalize="none" value={username} onChangeText={setUsername} />
      <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button title={isBusy ? 'Please wait…' : isRegister ? 'Register' : 'Login'} disabled={isBusy} onPress={handleSubmit} />
      <Pressable onPress={() => { setIsRegister(!isRegister); setError(''); }}>
        <Text style={styles.link}>{isRegister ? 'Have an account? Sign in' : 'No account? Register'}</Text>
      </Pressable>
    </View>
  );
}
