import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { XLSX_MIME, bytesToBase64 } from '@manage-expenses/core';

/** Saves the workbook to the app cache and opens the share sheet (save to Files, email, Drive, ...). */
export async function shareXlsx(bytes: Uint8Array, fileName: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: 'Export report', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
}
