FOCUSDAY — ENHANCED HABIT TRACKER + CLOUD SYNC
================================================

CARA MENJALANKAN
1. Ekstrak ZIP.
2. Buka folder focusday di VS Code.
3. Jalankan index.html dengan ekstensi Live Server (disarankan).
4. Fitur dasar bisa dipakai tanpa akun dan data disimpan lokal di browser.

FITUR YANG DITAMBAHKAN
- Habit tracker: nama, emoji, kategori, target, jadwal mingguan.
- Check-in harian dan riwayat check-in 7 hari.
- Current streak dan best streak.
- Dashboard dengan ringkasan task dan habit.
- Halaman Progress: total check-in, konsistensi 7 hari, aktivitas mingguan, statistik tiap habit.
- Backup/restore JSON.
- Sinkronisasi cloud opsional melalui Supabase (akun email/password).
- Fitur task, catatan, pengingat dan desain awal tetap dipertahankan.
- Migrasi otomatis membaca data lama focusday-data-v1 dan menyiapkan field habit yang baru.

CARA MENGAKTIFKAN SINKRONISASI CLOUD
Penting: sinkronisasi lintas perangkat memerlukan backend online. Karena akun/proyek Supabase milikmu belum tersedia di sini, ZIP ini sudah berisi integrasi dan SQL, tetapi kamu perlu mengaktifkannya satu kali.

1. Buka https://supabase.com/ dan buat project.
2. Di Supabase, buka SQL Editor, buat query baru, lalu jalankan seluruh isi file supabase-setup.sql.
3. Buka Project Settings > API (atau Connect). Salin Project URL dan anon/public key. JANGAN pakai service_role key dan jangan bagikan password.
4. Jalankan FocusDay lewat Live Server (bukan file://), buka Data & backup.
5. Tempel URL dan anon/public key, tekan “Simpan konfigurasi”.
6. Di bagian sinkronisasi, masukkan email dan password lalu tekan “Masuk / Daftar”. Jika akun belum ada, aplikasi akan menawarkan pendaftaran setelah login gagal. Jika verifikasi email aktif, verifikasi dulu.
7. Setelah masuk, tekan “Sinkronkan sekarang”. Saat login di perangkat lain menggunakan akun yang sama, pilih untuk memuat data dari cloud jika ditawarkan.
8. Gunakan “Ekspor backup” sebagai cadangan berkala.

CATATAN SINKRONISASI
- Supabase Auth mengelola login; kebijakan RLS di SQL membatasi data supaya hanya pemilik akun yang bisa membaca/menulis barisnya.
- Data lokal dan cloud tidak digabung otomatis. Saat ditemukan data cloud, aplikasi menanyakan apakah kamu ingin memuat data cloud ke perangkat. Pilih dengan hati-hati agar tidak menimpa data lokal yang belum dibackup.
- Sinkronisasi saat ini berupa snapshot data aplikasi. Untuk pemakaian multi-perangkat secara bersamaan, gunakan “Sinkronkan sekarang” setelah perubahan di perangkat lain. Auto-save mengirim perubahan ke cloud saat akun aktif.
- Cloud sync perlu internet. Jangan pernah memasukkan service_role key.
- Jika data cloud belum ada, sinkronisasi pertama mengunggah data lokal ke cloud.
- Browser dapat membatasi notifikasi saat halaman ditutup; pengingat di versi ini bukan push notification server.
- Font Google dapat memerlukan internet, tetapi font sistem menjadi pengganti jika tidak tersedia.

UJI MANUAL YANG DISARANKAN
[ ] Tambah habit, pilih jadwal Senin–Jumat dan target, lalu simpan.
[ ] Centang habit hari ini, refresh halaman, pastikan status tetap.
[ ] Periksa streak dan riwayat 7 hari.
[ ] Edit kategori/jadwal/target habit.
[ ] Tambah/edit/hapus task dan note.
[ ] Ekspor backup, lalu impor kembali.
[ ] Setup Supabase dan uji login/sinkronisasi di dua browser/perangkat.
