# Rangkuman Diskusi & Spesifikasi Perancangan Bot WhatsApp "Denia" (Sistem Booking Ruangan SDP Undiksha)

Dokumen ini memuat rangkuman lengkap, objektif, dan terperinci mengenai seluruh ide, evaluasi teknis, analisis celah (*vulnerabilities*), alternatif *best practice*, serta keputusan arsitektur sistem bot WhatsApp **Denia** yang telah didiskusikan tanpa penambahan maupun pengurangan esensi ide.

---

## 1. Identitas & Tujuan Utama Sistem

* **Nama Bot:** Denia
* **Kategori:** Multipurpose WhatsApp Bot
* **Fokus / Tujuan Utama:** 
  1. Memfasilitasi koordinator tingkat (korti) di lingkungan Sumber Daya Pembelajaran (SDP) Universitas Pendidikan Ganesha (Undiksha) Denpasar dalam proses peminjaman/booking ruangan kelas.
  2. Menyediakan alat kontrol dan transparansi bagi para staf kampus untuk:
     * Memantau seluruh aktivitas booking ruangan oleh mahasiswa secara *real-time*.
     * Melakukan intervensi terjadwal (memaksa mengambil alih ruangan jika ada agenda mendadak/acara institusional).
     * Melakukan audit menyeluruh terhadap alokasi kelas.
  3. Menerapkan pengamanan dan validasi ketat agar korti tidak memonopoli ruangan secara semena-mena.
* **Lingkungan Deploy:** Grup WhatsApp korti seluruh angkatan kampus.

---

## 2. Spesifikasi Rancangan Awal (Ide Dasar)

### A. Tumpukan Teknologi & Mekanisme Perintah
* **Runtime & Bahasa:** TypeScript + Bun
* **Trigger Perintah:** Menggunakan *exclamation mark command* (`!`).
* **Database Awal yang Diusulkan:** Google Spreadsheet.

### B. Daftar Perintah Awal (Ide Asli)
* **Mahasiswa / Korti:**
  * `!info`: Membalas (*ping/replay*) pesan rekap harian yang dikirim oleh cron job setiap jam 07.00 pagi mengenai status penggunaan ruangan hari ini dan besok.
  * `!pinjam [kode_ruangan] [hari] [jam_mulai]-[jam_selesai]`: Meminjam ruangan.
    * Contoh: `!pinjam RAK_4.1 kamis 10:30-13:30` (Keterangan: RAK = Gedung R. A. Kartini, 4.1 = Lantai 4 Ruangan 1).
  * `!batal [kode_ruangan] [hari]`: Membatalkan peminjaman ruangan.
    * Contoh: `!batal RAK_4.1 kamis`
  * `!reportinuse [kode_ruangan]`: Memberikan notifikasi eskalasi kepada staf kampus jika ada dosen yang langsung memakai ruangan yang sudah dipesan kelas lain tanpa konfirmasi via sistem bot, guna membantu mahasiswa mengonfrontasi dosen tersebut.

* **Admin / Staf:**
  * `!force [kode_ruangan] [tanggal] [jam_mulai]-[jam_akhir]`: Memaksa menimpa penggunaan ruangan untuk dosen pengampu tertentu. Bot otomatis mengirim pesan peringatan pembatalan kepada korti yang terimbas dan menyuruh mencari ruangan lain via `/cekruangan`.
    * Contoh: `!force Auditorium 12/09/2026 08:00-17:00`
    * Contoh Respon Penolakan ke korti yang mencoba meminjam: *"Gagal. Ruangan sedang diblokir untuk acara: Seminar Nasional."*
  * `!forceevent [list_kode_ruangan] [tanggal_mulai]-[tanggal_akhir]`: Memblokir beberapa ruangan sekaligus untuk periode tanggal tertentu bagi agenda kampus.
    * Contoh: `!forceevent [RAK_1.1, RAK_1.2, RAK_1.3, RAK_1.4] 03/09/2026-10/09/2026`
  * `!abort force` | `!abort forceevent`: Membatalkan status pemblokiran/force secara menyeluruh.

### C. Kamus Waktu Akademik (SKS Matrix)
Kamus pemetaan 1 huruf = 1 SKS (durasi 60 menit per SKS), dengan batas operasional maksimal pukul 22:30:
* **A:** 07:30 - 08:30
* **B:** 08:30 - 09:30
* **C:** 09:30 - 10:30
* **D:** 10:30 - 11:30
* **E:** 11:30 - 12:30
* **F:** 12:30 - 13:30
* **G:** 13:30 - 14:30
* **H:** 14:30 - 15:30
* **I:** 15:30 - 16:30
* **J:** 16:30 - 17:30
* **K:** 17:30 - 18:30
* **L:** 18:30 - 19:30
* **M:** 19:30 - 20:30
* **N:** 20:30 - 21:30
* **O:** 21:30 - 22:30

---

## 3. Evaluasi Celah (Vulnerabilities) & Analisis Kritis

1. **Google Sheets sebagai Database Utama (Tinggi Risiko):**
   * *Rate Limiting:* Google Sheets API memiliki kuota ketat (maksimal 60 request/menit per user dan 300 request/menit per project).
   * *Race Condition:* Sheets tidak mendukung transaksi ACID murni. Tingginya latensi penulisan (500ms–2 detik) memungkinkan dua korti memesan slot yang sama pada detik yang berdekatan dan keduanya dinyatakan berhasil.
2. **Celah Abuse Jam Bebas (`[jam_mulai]-[jam_selesai]`):**
   * Parameter jam bebas mengizinkan mahasiswa memesan durasi tak wajar (misal jam 09:00 - 17:00 / seharian penuh).
   * Menimbulkan fragmentasi jadwal nanggung (misal booking jam 10:45 - 12:15) yang merusak pembagian SKS mata kuliah lain.
3. **Ambiguitas Parameter "Hari":**
   * Perintah berbasis nama hari (seperti `kamis`) tidak jelas: apakah Kamis minggu ini, minggu depan, atau sepanjang semester.
4. **Masalah Verifikasi Identitas (Ownership):**
   * Input nama/NIM secara manual pada teks perintah rentan salah ketik (*typo*), manipulasi (*identity spoofing*), dan memperpanjang sintaks pesan.
5. **Polusi Chat Grup (*Chat Noise*):**
   * Setiap respons *success*, *failure*, atau *error* yang dibalas langsung satu per satu di grup publik angkatan akan mengakibatkan *chat flooding*.
6. **Friksi Sosial pada `!reportinuse`:**
   * Menghadapkan mahasiswa secara langsung dengan dosen pengampu di lapangan berisiko memicu intimidasi atau konflik relasi kuasa; dibutuhkan kanal pengaduan formal ke staf/satpam SDP.

---

## 4. Solusi & Best Practice Alternatif yang Disepakati

### A. Library WhatsApp
* Menggunakan **`@whiskeysockets/baileys`** (bukan Puppeteer / `whatsapp-web.js`).
* Alasan: Berbasis WebSocket native, hemat memori (~40MB–80MB vs 500MB+ Chromium), performa cepat, dan kompatibel penuh dengan Bun.

### B. Arsitektur Database Hibrida (SQLite + Google Sheets)
* **Local Transactional DB (`bun:sqlite`):** Menjadi *single source of truth* transaksi lokal dengan transaksi terkunci (`BEGIN IMMEDIATE`) untuk menjamin zero race condition.
* **Google Sheets Mirror:** Berfungsi hanya sebagai *Read-Only Monitoring Dashboard* bagi dosen/staf kampus yang disinkronkan secara asinkron via *background worker* (batch push berkala).

### C. Solusi Ownership Tanpa Input Manual
* Memanfaatkan pengenal unik WhatsApp JID (`message.key.participant` di grup) yang tidak dapat dipalsukan.
* Menggunakan mekanisme *whitelist registration*: Staf cukup mendaftarkan korti sekali di awal semester (`!register @mention [NIM] [Kelas]`). Setiap perintah otomatis divalidasi ke tabel `users` berdasarkan JID pengirim.

### D. Standardisasi Perintah Berbasis Kamus Slot (SKS)
Mengganti format jam bebas dengan kode slot berurutan:
* Sintaks: `!pinjam [kode_ruangan] [DD/MM/YYYY] [kode_slot]`
* Contoh: `!pinjam RAK_4.1 10/09/2026 DEF` (Menandakan 3 SKS dari jam 10:30 sampai 13:30 pada tanggal 10 September 2026).
* Validasi sistem:
  * Karakter harus berada dalam rentang `A-O`.
  * Harus berurutan secara kontigu (misal `DEF` valid, `ADF` ditolak).
  * Pembatasan kuota maksimal (misal maksimal 3–4 SKS per booking).

### E. Manajemen Antrean & Notifikasi: Micro-Batch Buffer (Tumbling Window)
* **Pencegahan Spam Grup:** Pesan konfirmasi keberhasilan tidak dikirim satuan, melainkan ditampung selama jendela waktu **1 menit** sejak pesan valid pertama masuk (*fixed 60-second window / tumbling window*). Setelah 1 menit, bot mem-pop seluruh transaksi sukses dalam **satu pesan rekap terstruktur**.
* **Pencegahan Ilusi Lag (UX):**
  * Memberikan respons instan berupa emoji reaction (contoh: ⏳ untuk antrean, ✅ untuk sukses masuk buffer, ❌ jika gagal/bentrok).
  * Pesan error/gagal dikirimkan lewat jalur pribadi (Japri/DM) ke korti bersangkutan agar tidak mengotori grup.

### F. Pemilihan Backend Framework
* **Keputusan:** Menggunakan **ElysiaJS**.
* **Pertimbangan Teknis:**
  * Didesain secara native dan optimal di atas Bun runtime.
  * Mendukung implementasi *Strategy Pattern* melalui arsitektur plugin modular.
  * Sangat adaptif terhadap struktur direktori berbasis fitur (*feature-based folder architecture*).

---

## 5. Skema Struktur Data Utama (SQLite Schema)

```sql
CREATE TABLE users (
    jid TEXT PRIMARY KEY,        -- Contoh: '628123456789@s.whatsapp.net'
    nama TEXT NOT NULL,
    nim TEXT UNIQUE NOT NULL,
    kelas TEXT NOT NULL,         -- Contoh: 'PTI 4A'
    role TEXT DEFAULT 'korti'    -- 'korti' | 'staff' | 'admin'
);

CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,     -- Contoh: 'RAK_4.1'
    booking_date TEXT NOT NULL,  -- Format ISO: 'YYYY-MM-DD'
    slot_code TEXT NOT NULL,     -- Contoh: 'D', 'E', 'F' (disimpan per 1 SKS unit)
    user_jid TEXT NOT NULL,
    status TEXT DEFAULT 'active',-- 'active' | 'force_cancelled' | 'cancelled'
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_jid) REFERENCES users(jid),
    UNIQUE(room_code, booking_date, slot_code, status)
);
```
