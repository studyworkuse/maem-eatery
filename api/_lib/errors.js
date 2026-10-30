/** Error dengan status HTTP; pesannya aman ditampilkan ke pengguna. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);

/**
 * Terjemahkan error Google API / konfigurasi menjadi petunjuk yang aman ditampilkan.
 * @returns {string|null} null bila bukan masalah yang dikenali
 */
export function describeGoogleError(error) {
  const status = error?.response?.status ?? error?.status;
  const detail = String(
    error?.response?.data?.error?.message ?? error?.response?.data?.error_description ?? error?.message ?? '',
  );
  const text = `${detail} ${error?.code ?? ''}`;

  if (/DECODER|PEM|private key|invalid_grant|invalid_client|unsupported/i.test(text)) {
    return 'GOOGLE_PRIVATE_KEY / GOOGLE_SERVICE_ACCOUNT_EMAIL tidak valid. Salin ulang dari file JSON Service Account.';
  }
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(text)) {
    return 'Google Sheets API belum diaktifkan di project Google Cloud (APIs & Services > Library > Google Sheets API > Enable).';
  }
  if (status === 403) {
    return 'Service Account tidak punya izin Editor di spreadsheet. Buka spreadsheet > Bagikan, lalu ubah peran email Service Account dari Pembaca/Viewer menjadi Editor.';
  }
  if (status === 404) return 'Spreadsheet tidak ditemukan. Periksa SPREADSHEET_ID.';
  if (status === 400 && /Unable to parse range|not found/i.test(text)) {
    return 'Nama tab di spreadsheet harus persis: "Rekapan Orderan", "Kelola Menu", "Kode Kupon".';
  }
  if (status === 429) return 'Kuota Google Sheets sementara penuh. Coba lagi sebentar.';
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(text)) return 'Server tidak dapat menghubungi Google Sheets. Coba lagi.';
  return null;
}
