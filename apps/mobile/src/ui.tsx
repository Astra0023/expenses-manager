import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { Account } from '@manage-expenses/core';
import { styles } from './styles';

export function Avatar({ user, size }: { user: Pick<Account, 'avatar' | 'firstName' | 'lastName'>; size: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (user.avatar) return <Image source={{ uri: user.avatar }} style={box} accessibilityLabel="Profile picture" />;
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || '?';
  return (
    <View style={[styles.avatar, box]}>
      <Text style={[styles.avatarText, { fontSize: size / 2.6 }]}>{initials}</Text>
    </View>
  );
}

export function Chip({ label, isOn, onPress }: { label: string; isOn: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: isOn }} style={[styles.chip, isOn && styles.chipOn]} onPress={onPress}>
      <Text style={isOn ? styles.chipTextOn : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} style={styles.input} {...props} />
    </View>
  );
}

export function Button({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} style={[styles.button, disabled && { opacity: 0.6 }]} disabled={disabled} onPress={onPress}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/** Dropdown: a field that opens a modal list of options. */
export function Select({ label, value, options, onChange }: { label: string; value: string; options: SelectOption[]; onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? '—';
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.select} onPress={() => setIsOpen(true)}>
        <Text>{current} ▾</Text>
      </Pressable>
      <Modal transparent visible={isOpen} animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setIsOpen(false)}>
          <View style={styles.modal}>
            <ScrollView>
              {options.map((o) => (
                <Pressable key={o.value} style={styles.item} onPress={() => { onChange(o.value); setIsOpen(false); }}>
                  <Text style={o.value === value ? styles.tabTextOn : undefined}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
