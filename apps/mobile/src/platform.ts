import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { KeyValueStorage, RandomBytes } from '@manage-expenses/core';

export const mobileStorage: KeyValueStorage = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

export const randomBytes: RandomBytes = (n) => Crypto.getRandomBytes(n);
