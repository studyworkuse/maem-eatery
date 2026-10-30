import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateSettingsInput } from '../api/_lib/validate.js';
import {
  DEFAULT_CLOSED_MESSAGE,
  computeStatus,
  nowInJakarta,
  parseRange,
  parseSettings,
  settingsToRows,
} from '../api/_lib/storeHours.js';

// Waktu Jakarta (WIB, UTC+7) -> Date. 2026-10-29 adalah hari Kamis.
const wib = (isoLocal) => new Date(`${isoLocal}+07:00`);

const settings = (overrides = {}) => ({
  mode: 'auto',
  hours: {
    senin: '09:00-21:00',
    selasa: '09:00-21:00',
    rabu: '09:00-21:00',
    kamis: '09:00-21:00',
    jumat: '09:00-21:00',
    sabtu: '10:00-22:00',
    minggu: 'tutup',
  },
  announcement: '',
  closedMessage: DEFAULT_CLOSED_MESSAGE,
  ...overrides,
});

describe('parseRange', () => {
  it('membaca jam, hari libur, dan format salah', () => {
    assert.deepEqual(parseRange('09:00-21:00'), { start: 540, end: 1260 });
    assert.deepEqual(parseRange('9.30 - 17.00'), { start: 570, end: 1020 });
    assert.equal(parseRange('tutup'), null);
    assert.equal(parseRange('Libur'), null);
    assert.equal(parseRange(''), null);
    assert.equal(parseRange('25:00-26:00'), undefined);
    assert.equal(parseRange('09:00-09:00'), undefined);
    assert.equal(parseRange('pagi-malam'), undefined);
  });
});

describe('waktu Jakarta', () => {
  it('hari dan menit mengikuti WIB, bukan UTC', () => {
    // 2026-10-29 18:00 UTC = Jumat 01:00 WIB
    assert.deepEqual(nowInJakarta(new Date('2026-10-29T18:00:00Z')), { dayIndex: 4, minutes: 60 });
    assert.deepEqual(nowInJakarta(wib('2026-10-29T10:30:00')), { dayIndex: 3, minutes: 630 });
  });
});

describe('computeStatus (jadwal)', () => {
  it('buka di dalam jam, tutup tepat di jam tutup', () => {
    assert.equal(computeStatus(settings(), wib('2026-10-29T09:00:00')).open, true); // tepat buka
    const open = computeStatus(settings(), wib('2026-10-29T20:59:00'));
    assert.equal(open.open, true);
    assert.equal(open.closesAt, '21:00');
    assert.equal(open.label, 'Buka · sampai 21:00');
    assert.equal(computeStatus(settings(), wib('2026-10-29T21:00:00')).open, false); // tepat tutup
  });

  it('sebelum buka: label menyebut jam buka hari ini', () => {
    const s = computeStatus(settings(), wib('2026-10-29T07:30:00'));
    assert.equal(s.open, false);
    assert.equal(s.label, 'Tutup · buka pukul 09:00');
  });

  it('setelah tutup: buka besok', () => {
    const s = computeStatus(settings(), wib('2026-10-29T22:00:00'));
    assert.equal(s.label, 'Tutup · buka besok 09:00');
  });

  it('hari libur: lompat ke hari buka berikutnya', () => {
    const s = computeStatus(settings(), wib('2026-11-01T12:00:00')); // Minggu
    assert.equal(s.open, false);
    assert.equal(s.nextOpen.dayLabel, 'Senin');
    assert.equal(s.label, 'Tutup · buka besok 09:00');
    const sat = computeStatus(settings(), wib('2026-10-31T23:00:00')); // Sabtu malam, Minggu libur
    assert.equal(sat.label, 'Tutup · buka Senin 09:00');
  });

  it('semua hari libur: hanya "Tutup"', () => {
    const closed = Object.fromEntries(Object.keys(settings().hours).map((d) => [d, 'tutup']));
    assert.equal(computeStatus(settings({ hours: closed }), wib('2026-10-29T12:00:00')).label, 'Tutup');
  });

  it('jadwal lewat tengah malam (18:00-02:00)', () => {
    const night = settings({ hours: { ...settings().hours, kamis: '18:00-02:00', jumat: 'tutup' } });
    assert.equal(computeStatus(night, wib('2026-10-29T17:59:00')).open, false);
    assert.equal(computeStatus(night, wib('2026-10-29T23:30:00')).open, true);
    const after = computeStatus(night, wib('2026-10-30T01:30:00')); // Jumat dini hari, sisa jadwal Kamis
    assert.equal(after.open, true);
    assert.equal(after.closesAt, '02:00');
    assert.equal(computeStatus(night, wib('2026-10-30T02:00:00')).open, false);
  });
});

describe('computeStatus (mode manual)', () => {
  it('buka paksa walau di luar jam dan hari libur', () => {
    const s = computeStatus(settings({ mode: 'open' }), wib('2026-11-01T03:00:00'));
    assert.equal(s.open, true);
    assert.equal(s.source, 'manual');
  });

  it('tutup paksa walau di dalam jam operasional', () => {
    const s = computeStatus(settings({ mode: 'closed' }), wib('2026-10-29T12:00:00'));
    assert.equal(s.open, false);
    assert.equal(s.label, 'Tutup sementara');
  });
});

describe('parseSettings / settingsToRows', () => {
  it('tanpa data: bawaan auto + jam 09:00-21:00 tiap hari', () => {
    const s = parseSettings([]);
    assert.equal(s.mode, 'auto');
    assert.equal(s.hours.senin, '09:00-21:00');
    assert.equal(s.closedMessage, DEFAULT_CLOSED_MESSAGE);
  });

  it('menerima kata Indonesia & jam ditulis manual di Sheets', () => {
    const s = parseSettings([
      ['mode', 'TUTUP'],
      ['jam_senin', '8.00-17.00'],
      ['jam_selasa', 'libur'],
      ['jam_rabu', 'ngawur'],
      ['pengumuman', 'Promo hari ini!'],
    ]);
    assert.equal(s.mode, 'closed');
    assert.equal(s.hours.senin, '08:00-17:00');
    assert.equal(s.hours.selasa, 'tutup');
    assert.equal(s.hours.rabu, 'tutup'); // format salah dianggap tutup
    assert.equal(s.hours.kamis, '09:00-21:00'); // baris tidak ada -> bawaan
    assert.equal(s.announcement, 'Promo hari ini!');
  });

  it('bolak-balik objek <-> baris Sheets', () => {
    const original = settings({ mode: 'open', announcement: 'Halo' });
    assert.deepEqual(parseSettings(settingsToRows(original)), original);
  });
});

describe('validateSettingsInput', () => {
  const body = { mode: 'auto', hours: settings().hours, announcement: ' Promo! ', closedMessage: '' };

  it('menormalkan dan memberi pesan tutup bawaan', () => {
    const v = validateSettingsInput(body);
    assert.equal(v.announcement, 'Promo!');
    assert.equal(v.closedMessage, DEFAULT_CLOSED_MESSAGE);
  });

  it('menolak mode dan jam yang tidak valid', () => {
    assert.throws(() => validateSettingsInput({ ...body, mode: 'selalu' }), /Mode/);
    assert.throws(() => validateSettingsInput({ ...body, hours: { ...body.hours, rabu: '09:00-09:00' } }), /Rabu/);
    assert.throws(() => validateSettingsInput({ ...body, hours: { ...body.hours, kamis: undefined } }), /Kamis/);
    assert.throws(() => validateSettingsInput({ ...body, announcement: 'x'.repeat(501) }), /Pengumuman/);
  });
});
