import { Text, View } from 'react-native';
import { Button } from './ui';
import { styles } from './styles';

export function DemoScreen({ onClose }: { onClose: () => void }) {
  return <View>
    <Text style={styles.title}>A calmer money routine</Text>
    <View style={[styles.card, { backgroundColor: '#143c35' }]}>
      <Text style={{ color: '#b7decf', marginBottom: 8 }}>SAMPLE MONTH · READ-ONLY DEMO</Text>
      <Text style={{ fontSize: 36, color: '#fff', fontWeight: '700' }}>$1,840 left</Text>
      <Text style={{ color: '#d3e9e1', marginTop: 10 }}>$1,160 spent of a $3,000 monthly spending plan</Text>
      <View style={styles.bar}><View style={[styles.barFill, { width: '39%', backgroundColor: '#8dd8b8' }]} /></View>
    </View>
    <View style={styles.card}>
      <Text style={styles.h2}>Where the month is going</Text>
      {[['Groceries', '$340 of $500'], ['Housing', '$700 of $900'], ['Transport', '$120 of $250']].map(([label, amount]) =>
        <View key={label} style={styles.item}><Text>{label}</Text><Text>{amount}</Text></View>)}
    </View>
    <View style={styles.card}>
      <Text style={styles.h2}>Coming up</Text>
      <Text>Internet · $60 · monthly</Text>
      <Text style={styles.muted}>3-day reminder · manually mark paid when ready</Text>
    </View>
    <Text style={[styles.muted, { marginBottom: 16 }]}>Sample figures only. This preview does not create an account, access local financial data, change your session, or schedule notifications.</Text>
    <Button title="Exit demo" onPress={onClose} />
  </View>;
}
