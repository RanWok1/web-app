/* FocusDay Enhanced — habit tracker, progress, backup, and optional Supabase cloud sync. */
"use strict";

const STORAGE_KEY = "focusday-data-v2";
const SUPABASE_URL_KEY = "focusday-supabase-url";
const SUPABASE_KEY_KEY = "focusday-supabase-anon-key";
const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`);
const esc = (v="") => String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = (v, opts={day:"numeric",month:"short",year:"numeric"}) => {
  if(!v) return "Tanpa tanggal";
  const d = typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? "Tanggal tidak valid" : new Intl.DateTimeFormat("id-ID",opts).format(d);
};
const DAYS = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const defaultData = () => ({tasks:[],notes:[],habits:[],notifiedReminders:[]});
function loadData(){
  try {
    const old = localStorage.getItem("focusday-data-v1");
    const raw = localStorage.getItem(STORAGE_KEY) || old;
    if(!raw) return defaultData();
    const p = JSON.parse(raw);
    const habits = Array.isArray(p.habits) ? p.habits.map(h=>({
      ...h, id:h.id||makeId(), title:h.title||h.name||"Habit",
      checks:Array.isArray(h.checks)?h.checks:(Array.isArray(h.logs)?h.logs:[]),
      category:h.category||"Pribadi", target:h.target||"", days:Array.isArray(h.days)?h.days:[0,1,2,3,4,5,6],
      createdAt:h.createdAt||new Date().toISOString()
    })) : [];
    return {tasks:Array.isArray(p.tasks)?p.tasks:[],notes:Array.isArray(p.notes)?p.notes:[],habits,
      notifiedReminders:Array.isArray(p.notifiedReminders)?p.notifiedReminders:[]};
  } catch(e){console.error(e);return defaultData();}
}
let data=loadData(), currentView="dashboard", taskFilter="all", taskSearch="", noteSearch="", habitFilter="all", toastTimer, cloud=null, cloudUser=null, cloudBusy=false, saveDebounce;
const $ = s=>document.querySelector(s);
const viewRoot=$("#app-view"), pageTitle=$("#page-title"), toastRoot=$("#toast");
function showToast(msg){toastRoot.textContent=msg;toastRoot.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastRoot.classList.remove("show"),2800);}
function localSave(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true;}
  catch(e){showToast("Penyimpanan gagal. Coba ekspor backup.");return false;}
}
function saveData(){
  localSave();
  if(cloud && cloudUser){
    clearTimeout(saveDebounce);
    saveDebounce=setTimeout(()=>syncToCloud(false),650);
  }
}
function setView(view){
  currentView=view;
  const titles={dashboard:"Dashboard",tasks:"Tugas",notes:"Catatan",habits:"Habit tracker",progress:"Progress",reminders:"Pengingat",settings:"Data & backup"};
  pageTitle.textContent=titles[view]||"Dashboard";
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  render(); window.scrollTo({top:0,behavior:"smooth"});
}
function render(){
  const f={dashboard:renderDashboard,tasks:renderTasks,notes:renderNotes,habits:renderHabits,progress:renderProgress,reminders:renderReminders,settings:renderSettings};
  (f[currentView]||renderDashboard)();
}
function empty(icon,title,desc,button="",action=""){
 return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${esc(title)}</strong><div>${esc(desc)}</div>${button?`<p><button class="button secondary" data-action="${action}">${esc(button)}</button></p>`:""}</div>`;
}
function habitScheduled(h, key=todayKey()){
 const d=new Date(`${key}T12:00:00`).getDay();return (h.days||[0,1,2,3,4,5,6]).includes(d);
}
function habitDone(h,key=todayKey()){return (h.checks||[]).includes(key);}
function streak(h){
 const checks=new Set(h.checks||[]);let d=new Date();if(!checks.has(todayKey()))d.setDate(d.getDate()-1);
 let n=0;for(let i=0;i<500;i++){const k=todayKey(d);if(!(h.days||[0,1,2,3,4,5,6]).includes(d.getDay())){d.setDate(d.getDate()-1);continue;}if(checks.has(k)){n++;d.setDate(d.getDate()-1);}else break;}return n;
}
function bestStreak(h){
 const checks=new Set(h.checks||[]);if(!checks.size)return 0;
 const sorted=[...checks].sort();let d=new Date(`${sorted[0]}T12:00:00`),end=new Date(`${sorted[sorted.length-1]}T12:00:00`),run=0,best=0;
 while(d<=end){const k=todayKey(d);if((h.days||[0,1,2,3,4,5,6]).includes(d.getDay())){if(checks.has(k)){run++;best=Math.max(best,run)}else run=0;}d.setDate(d.getDate()+1);}return best;
}
function bestAll(){return data.habits.reduce((m,h)=>Math.max(m,bestStreak(h)),0);}
function formatDuration(ms){
  const total=Math.max(0,Math.floor(ms/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
  return [h,m,s].map(v=>String(v).padStart(2,"0")).join(":");
 }
 function taskElapsedMs(t){
  return Math.max(0,Number(t.timeSpentMs)||0)+Math.max(0,Number(t.timerAccumulatedMs)||0)+(t.timerStartedAt?Math.max(0,Date.now()-new Date(t.timerStartedAt).getTime()):0);
 }
 function taskTimerMarkup(t){
  const running=!!t.timerStartedAt,paused=(Number(t.timerAccumulatedMs)||0)>0;
  const action=running?"timer-pause":"timer-start",label=running?"Jeda":paused?"Lanjutkan":"Mulai mengerjakan";
  return `<div class="task-timer"><div class="task-timer-info"><strong data-task-timer="${esc(t.id)}">${formatDuration(taskElapsedMs(t))}</strong><small>Total: ${formatDuration(Number(t.timeSpentMs)||0)}</small></div><div class="task-timer-actions"><button class="button secondary small" data-action="${action}" data-id="${esc(t.id)}">${label}</button>${paused||running?`<button class="button secondary small" data-action="timer-finish" data-id="${esc(t.id)}">Selesaikan sesi</button>`:""}</div></div>`;
 }
 function taskRow(t,actions=false){
  const p={high:"Tinggi",medium:"Sedang",low:"Rendah"}[t.priority]||"Sedang";
  return `<div class="task-row"><button type="button" class="task-check-button ${t.done?"checked":""}" data-action="toggle-task" data-id="${esc(t.id)}" aria-pressed="${!!t.done}" aria-label="${t.done?"Batalkan tugas selesai":"Tandai tugas selesai"}">${t.done?"✓":""}</button><div class="task-main"><div class="task-title ${t.done?"done":""}">${esc(t.title)}</div><div class="task-meta"><span>${esc(t.category||"Lainnya")}</span><span>•</span><span>${t.dueAt?esc(fmtDate(t.dueAt,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})):"Tanpa tenggat"}</span><span class="pill ${esc(t.priority||"medium")}">${p}</span></div>${taskTimerMarkup(t)}</div>${actions?`<div class="card-actions"><button class="mini-action" data-action="edit-task" data-id="${esc(t.id)}">Edit</button><button class="mini-action" data-action="delete-task" data-id="${esc(t.id)}">Hapus</button></div>`:""}</div>`;
 }
 function habitCard(h){
 const done=habitDone(h), checks=new Set(h.checks||[]), recent=[];
 for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=todayKey(d);recent.push({key:k,label:DAYS[d.getDay()],done:checks.has(k)});}
 return `<article class="habit-card"><div class="habit-emoji">${esc(h.emoji||"✦")}</div><div class="habit-info"><h3 class="${done?"done":""}">${esc(h.title)}</h3><p>${esc(h.category||"Pribadi")}${h.target?" · "+esc(h.target):""}</p><p class="habit-sub">Jadwal: ${esc((h.days||[0,1,2,3,4,5,6]).map(d=>DAYS[d]).join(", "))}</p><div class="week-dots">${recent.map(d=>`<span class="week-dot ${d.done?"checked":""}" title="${d.key}: ${d.done?"selesai":"belum selesai"}">${d.label.slice(0,1)}</span>`).join("")}</div><p class="habit-sub">🔥 Streak ${streak(h)} hari · Best ${bestStreak(h)} · ${h.checks.length} check-in</p><div class="habit-actions"><button class="button ${done?"secondary":"primary"}" data-action="toggle-habit" data-id="${esc(h.id)}">${done?"✓ Selesai hari ini":"Tandai selesai"}</button><button class="mini-action" data-action="edit-habit" data-id="${esc(h.id)}">Edit</button><button class="mini-action" data-action="delete-habit" data-id="${esc(h.id)}">Hapus</button></div></div></article>`;
}
function renderDashboard(){
 const today=todayKey(),scheduled=data.habits.filter(h=>habitScheduled(h)),doneHabits=scheduled.filter(h=>habitDone(h)).length;
 const tasksToday=data.tasks.filter(t=>!t.dueAt||t.dueAt.slice(0,10)===today),doneToday=tasksToday.filter(t=>t.done).length;
 const active=data.tasks.filter(t=>!t.done).sort((a,b)=>(a.dueAt||"9999").localeCompare(b.dueAt||"9999")).slice(0,5);
 const pinned=data.notes.filter(n=>n.pinned).slice(0,3);
 viewRoot.innerHTML=`<section class="view-intro"><div><p>Selamat datang kembali 👋</p><h2 style="margin-top:7px">Mulai dari satu hal kecil.</h2><p>Atur tugas, simpan ide, dan bangun kebiasaan baik.</p></div><button class="button primary" data-action="add-task">＋ Tambah tugas</button></section>
 <div class="grid stats-grid">
 <article class="stat-card"><div class="stat-top"><span>Tugas selesai hari ini</span><span class="stat-icon">✓</span></div><div class="stat-number">${doneToday}/${tasksToday.length}</div><div class="stat-caption">Berdasarkan tugas hari ini</div></article>
 <article class="stat-card"><div class="stat-top"><span>Habit hari ini</span><span class="stat-icon">✦</span></div><div class="stat-number">${doneHabits}/${scheduled.length}</div><div class="progress-track"><div class="progress-fill" style="width:${scheduled.length?doneHabits/scheduled.length*100:0}%"></div></div><div class="stat-caption">${scheduled.length?Math.round(doneHabits/scheduled.length*100):0}% kebiasaan selesai</div></article>
 <article class="stat-card"><div class="stat-top"><span>Best streak</span><span class="stat-icon">🔥</span></div><div class="stat-number">${bestAll()} hari</div><div class="stat-caption">Rangkaian check-in terbaik</div></article>
 <article class="stat-card"><div class="stat-top"><span>Check-in keseluruhan</span><span class="stat-icon">↗</span></div><div class="stat-number">${data.habits.reduce((n,h)=>n+h.checks.length,0)}</div><div class="stat-caption">Setiap langkah dihitung</div></article></div>
 <div class="grid dashboard-grid"><section class="panel"><div class="panel-heading"><h2>Habit hari ini</h2><button class="text-link" data-view="habits">Lihat semua →</button></div><div class="habit-list">${scheduled.length?scheduled.slice(0,5).map(h=>`<div class="task-row"><span class="habit-emoji small-emoji">${esc(h.emoji||"✦")}</span><div class="task-main"><div class="task-title ${habitDone(h)?"done":""}">${esc(h.title)}</div><div class="task-meta">${esc(h.target||h.category||"Habit")}</div></div><input class="habit-check" type="checkbox" data-action="toggle-habit" data-id="${esc(h.id)}" ${habitDone(h)?"checked":""}></div>`).join(""):empty("✦","Belum ada habit hari ini","Tambahkan kebiasaan dan pilih jadwalnya.","Tambah habit","add-habit")}</div><p style="margin-top:14px"><button class="button secondary" data-action="add-habit">＋ Tambah habit</button></p></section>
 <section class="panel"><div class="panel-heading"><h2>Tugas berikutnya</h2><button class="text-link" data-view="tasks">Lihat semua →</button></div><div class="task-list">${active.length?active.map(t=>taskRow(t)).join(""):empty("✓","Semua beres","Tambahkan tugas berikutnya.","Tambah tugas","add-task")}</div></section></div>
 <section class="panel"><div class="panel-heading"><h2>Catatan disematkan</h2><button class="text-link" data-view="notes">Semua catatan →</button></div>${pinned.length?pinned.map(n=>`<div class="task-row"><div class="task-main"><div class="task-title">📌 ${esc(n.title)}</div><div class="task-meta">${esc(n.body.slice(0,120))}</div></div></div>`).join(""):empty("▤","Belum ada catatan disematkan","Sematkan catatan penting agar mudah ditemukan.")}</section>`;
}
function renderTasks(){
 let arr=data.tasks.slice();if(taskFilter==="active")arr=arr.filter(t=>!t.done);if(taskFilter==="done")arr=arr.filter(t=>t.done);if(taskFilter==="today")arr=arr.filter(t=>t.dueAt&&t.dueAt.slice(0,10)===todayKey());
 if(taskSearch)arr=arr.filter(t=>`${t.title} ${t.category||""}`.toLowerCase().includes(taskSearch.toLowerCase()));
 arr.sort((a,b)=>Number(a.done)-Number(b.done)||(a.dueAt||"9999").localeCompare(b.dueAt||"9999"));
 viewRoot.innerHTML=`<section class="view-intro"><div><p>Semua pekerjaan dalam satu tempat.</p></div><button class="button primary" data-action="add-task">＋ Tambah tugas</button></section><input class="search-input" id="task-search" placeholder="Cari tugas atau kategori..." value="${esc(taskSearch)}"><div class="filters">${[["all","Semua"],["active","Belum selesai"],["today","Tenggat hari ini"],["done","Selesai"]].map(([v,l])=>`<button class="filter-btn ${taskFilter===v?"active":""}" data-action="task-filter" data-value="${v}">${l}</button>`).join("")}</div><section class="panel"><div class="panel-heading"><h2>${arr.length} tugas</h2></div><div class="task-list">${arr.length?arr.map(t=>taskRow(t,true)).join(""):empty("✓","Belum ada tugas di sini","Tambah tugas atau ubah filter.","Tambah tugas","add-task")}</div></section>`;
}
function renderNotes(){
 let arr=data.notes.slice().sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(b.updatedAt||"").localeCompare(a.updatedAt||""));
 if(noteSearch)arr=arr.filter(n=>`${n.title} ${n.body}`.toLowerCase().includes(noteSearch.toLowerCase()));
 viewRoot.innerHTML=`<section class="view-intro"><div><p>Tempat menyimpan ide dan hal penting.</p></div><button class="button primary" data-action="add-note">＋ Catatan baru</button></section><input class="search-input" id="note-search" placeholder="Cari judul atau isi catatan..." value="${esc(noteSearch)}"><div class="grid page-grid">${arr.length?arr.map(n=>`<article class="note-card ${n.pinned?"pinned":""}"><h3>${n.pinned?"📌 ":""}${esc(n.title)}</h3><div class="note-preview">${esc(n.body.length>240?n.body.slice(0,240)+"…":n.body)}</div><div class="note-footer"><span>${fmtDate(n.updatedAt||n.createdAt,{day:"numeric",month:"short"})}</span><div class="card-actions"><button class="mini-action" data-action="edit-note" data-id="${esc(n.id)}">Edit</button><button class="mini-action" data-action="delete-note" data-id="${esc(n.id)}">Hapus</button></div></div></article>`).join(""):empty("▤","Belum ada catatan","Simpan ide supaya tidak terlupakan.","Buat catatan","add-note")}</div>`;
}
function renderHabits(){
 const scheduled=data.habits.filter(h=>habitScheduled(h)),done=scheduled.filter(h=>habitDone(h)).length;
 let arr=data.habits.slice();if(habitFilter==="active")arr=arr.filter(h=>habitScheduled(h)&&!habitDone(h));if(habitFilter==="done")arr=arr.filter(h=>habitScheduled(h)&&habitDone(h));
 const total=data.habits.reduce((n,h)=>n+h.checks.length,0);
 const last7=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=todayKey(d);const due=data.habits.filter(h=>habitScheduled(h,k));last7.push({key:k,label:DAYS[d.getDay()],done:due.filter(h=>habitDone(h,k)).length,total:due.length});}
 viewRoot.innerHTML=`<section class="view-intro"><div><p>Bangun kebiasaan kecil yang bertahan lama.</p></div><button class="button primary" data-action="add-habit">＋ Kebiasaan baru</button></section>
 <section class="panel"><div class="panel-heading"><h2>Progres hari ini</h2><strong style="color:var(--cyan)">${done}/${scheduled.length}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${scheduled.length?done/scheduled.length*100:0}%"></div></div><div class="progress-label"><span>Selesai</span><span>${scheduled.length?Math.round(done/scheduled.length*100):0}%</span></div><div class="habit-metrics"><span>Total check-in <strong>${total}</strong></span><span>Best streak <strong>${bestAll()} hari</strong></span></div></section>
 <div class="filters">${[["all","Semua"],["active","Belum selesai hari ini"],["done","Selesai hari ini"]].map(([v,l])=>`<button class="filter-btn ${habitFilter===v?"active":""}" data-action="habit-filter" data-value="${v}">${l}</button>`).join("")}<button class="filter-btn" data-action="habit-history">Riwayat 7 hari</button></div>
 <div class="habit-list">${arr.length?arr.map(habitCard).join(""):empty("↗","Belum ada habit di filter ini","Buat habit atau ubah filter.","Tambah habit","add-habit")}</div>
 <section class="panel" id="habit-history-panel" hidden><div class="panel-heading"><h2>Riwayat 7 hari</h2></div><div class="history-grid">${last7.map(d=>`<div class="history-day"><span>${d.label}</span><strong>${d.done}/${d.total}</strong><small>${fmtDate(d.key,{day:"numeric",month:"short"})}</small><div class="progress-track"><div class="progress-fill" style="width:${d.total?d.done/d.total*100:0}%"></div></div></div>`).join("")}</div></section>`;
}
function renderProgress(){
 const total=data.habits.reduce((n,h)=>n+h.checks.length,0), active=data.habits.length;
 let expected=0,completed=0;for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()-i);const k=todayKey(d);data.habits.forEach(h=>{if(habitScheduled(h,k)){expected++;if(habitDone(h,k))completed++;}});}
 const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=todayKey(d);const due=data.habits.filter(h=>habitScheduled(h,k));days.push({key:k,label:DAYS[d.getDay()],done:due.filter(h=>habitDone(h,k)).length,total:due.length});}
 viewRoot.innerHTML=`<section class="view-intro"><div><p>Lihat perkembanganmu, bukan kesempurnaan.</p></div></section><div class="grid stats-grid"><article class="stat-card"><div class="stat-top"><span>Total check-in</span><span class="stat-icon">✓</span></div><div class="stat-number">${total}</div><div class="stat-caption">Semua kebiasaan</div></article><article class="stat-card"><div class="stat-top"><span>Konsistensi 7 hari</span><span class="stat-icon">↗</span></div><div class="stat-number">${expected?Math.round(completed/expected*100):0}%</div><div class="stat-caption">Check-in dari jadwal</div></article><article class="stat-card"><div class="stat-top"><span>Habit dibuat</span><span class="stat-icon">✦</span></div><div class="stat-number">${active}</div><div class="stat-caption">Kebiasaan tersimpan</div></article><article class="stat-card"><div class="stat-top"><span>Best streak</span><span class="stat-icon">🔥</span></div><div class="stat-number">${bestAll()} hari</div><div class="stat-caption">Hari berturut sesuai jadwal</div></article></div>
 <section class="panel"><div class="panel-heading"><h2>Aktivitas 7 hari terakhir</h2><span class="helper-text">Habit selesai per hari</span></div><div class="history-grid chart-history">${days.map(d=>`<div class="history-day"><span>${d.label}</span><strong>${d.done}/${d.total}</strong><small>${fmtDate(d.key,{day:"numeric",month:"short"})}</small><div class="chart-track"><div class="chart-fill" style="height:${d.total?d.done/d.total*100:0}%"></div></div></div>`).join("")}</div></section>
 <section class="panel"><div class="panel-heading"><h2>Ringkasan setiap habit</h2></div><div class="task-list">${data.habits.length?data.habits.map(h=>`<div class="task-row"><span class="habit-emoji small-emoji">${esc(h.emoji||"✦")}</span><div class="task-main"><div class="task-title">${esc(h.title)}</div><div class="task-meta">${esc(h.category||"Pribadi")} · ${h.checks.length} check-in · streak ${streak(h)} hari · best ${bestStreak(h)} hari</div></div></div>`).join(""):empty("↗","Belum ada data","Tambahkan habit untuk melihat statistik.")}</div></section>`;
}
function renderReminders(){
 const arr=data.tasks.filter(t=>t.reminderAt&&!t.done).sort((a,b)=>a.reminderAt.localeCompare(b.reminderAt));
 viewRoot.innerHTML=`<section class="view-intro"><div><p>Pengingat terhubung dengan tugas yang belum selesai.</p></div><button class="button primary" data-action="add-task">＋ Atur pengingat</button></section><section class="panel"><div class="panel-heading"><h2>Jadwal pengingat</h2></div><p class="helper-text">Biarkan FocusDay terbuka agar pengingat lokal diperiksa. Browser/HP dapat membatasi notifikasi ketika halaman ditutup.</p><div class="reminder-list">${arr.length?arr.map(t=>`<article class="reminder-card"><div class="reminder-symbol">◷</div><div class="reminder-info"><h3>${esc(t.title)}</h3><p>${esc(fmtDate(t.reminderAt))}</p><p>${new Date(t.reminderAt).getTime()<=Date.now()?"Waktu sudah tiba atau terlewat.":"Pengingat terjadwal."}</p></div><button class="mini-action" data-action="edit-task" data-id="${esc(t.id)}">Edit</button></article>`).join(""):empty("◷","Belum ada pengingat","Tambahkan waktu pengingat pada tugas.","Tambah tugas","add-task")}</div></section>`;
}
function renderSettings(){
 const configured=Boolean(localStorage.getItem(SUPABASE_URL_KEY)&&localStorage.getItem(SUPABASE_KEY_KEY));
 viewRoot.innerHTML=`<section class="view-intro"><div><p>Backup, notifikasi, dan sinkronisasi lintas perangkat.</p></div></section><div class="grid settings-grid">
 <section class="panel setting-card"><h2>Backup data</h2><p>Ekspor semua tugas, catatan, habit, dan riwayat sebagai file JSON. Impor akan mengganti data lokal.</p><div class="setting-actions"><button class="button primary" data-action="export">Ekspor backup</button><button class="button secondary" data-action="import">Impor backup</button><input type="file" id="import-file" accept=".json,application/json" hidden></div></section>
 <section class="panel setting-card"><h2>Notifikasi browser</h2><p>Izinkan notifikasi untuk pengingat saat FocusDay terbuka.</p><div class="setting-actions"><button class="button secondary" data-action="enable-notifications">Aktifkan notifikasi</button></div><p id="notification-status" style="margin-top:12px">${("Notification" in window)?`Status izin: ${esc(Notification.permission)}`:"Browser tidak mendukung Web Notifications."}</p></section>
 <section class="panel setting-card cloud-card"><h2>☁️ Sinkronisasi cloud</h2><p>Gunakan Supabase agar data dapat dibuka di perangkat lain. Kamu perlu membuat project Supabase gratis, lalu memasukkan Project URL dan anon/public key di bawah. Jangan pernah masukkan service_role key.</p>
 <label>Supabase Project URL<input class="sync-input" id="supabase-url" placeholder="https://xxxx.supabase.co" value="${esc(localStorage.getItem(SUPABASE_URL_KEY)||"")}"></label>
 <label>Supabase anon/public key<input class="sync-input" id="supabase-key" placeholder="sb_publishable_... atau anon key" value="${esc(localStorage.getItem(SUPABASE_KEY_KEY)||"")}"></label>
 <div class="setting-actions"><button class="button secondary" data-action="configure-cloud">Simpan konfigurasi</button><button class="button primary" data-action="cloud-signin">Masuk / Daftar</button><button class="button secondary" data-action="cloud-sync">Sinkronkan sekarang</button><button class="button secondary" data-action="cloud-signout">Keluar akun</button></div>
 <p class="cloud-status" id="cloud-status">${cloudUser?`Terhubung sebagai ${esc(cloudUser.email)}`:configured?"Konfigurasi tersimpan; masuk untuk mengaktifkan sync.":"Belum dikonfigurasi. Data tetap tersimpan lokal."}</p>
 <div class="cloud-auth" id="cloud-auth"><label>Email<input class="sync-input" type="email" id="cloud-email" placeholder="email@contoh.com"></label><label>Password<input class="sync-input" type="password" id="cloud-password" minlength="6" placeholder="Minimal 6 karakter"></label><p class="helper-text">Daftar membuat akun Supabase; verifikasi email mungkin diminta bergantung pengaturan project.</p></div>
 <details class="sql-details"><summary>Petunjuk tabel database</summary><p>Jalankan SQL dari file <code>supabase-setup.sql</code> yang ada di ZIP pada Supabase SQL Editor. Setelah itu, isi konfigurasi dan masuk dengan akun yang sama di setiap perangkat.</p></details></section>
 <section class="panel setting-card"><h2>Data perangkat</h2><p>Data tetap tersimpan di browser ini sebagai cadangan lokal. Sinkronisasi cloud memerlukan koneksi internet, konfigurasi Supabase, dan akun.</p><p><strong>Status:</strong> ${cloudUser?"Akun cloud aktif":"Lokal"}</p></section>
 <section class="panel setting-card"><h2>Reset data lokal</h2><p>Hapus semua tugas, catatan, dan kebiasaan pada perangkat ini. Ekspor backup dahulu jika diperlukan.</p><button class="button danger" data-action="reset">Hapus semua data</button></section></div>`;
}
function openDialog(id){const d=$("#"+id);if(d&&d.showModal)d.showModal();else showToast("Browser tidak mendukung dialog.");}
function closeDialogs(){document.querySelectorAll("dialog[open]").forEach(d=>d.close());}
function toLocalInput(v){if(!v)return"";const d=new Date(v);return Number.isNaN(d.getTime())?"":new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function openTaskForm(task=null){
 $("#task-form").reset();$("#task-id").value=task?.id||"";$("#task-title").value=task?.title||"";$("#task-category").value=task?.category||"Belajar";$("#task-priority").value=task?.priority||"medium";$("#task-due").value=toLocalInput(task?.dueAt);$("#task-reminder").value=toLocalInput(task?.reminderAt);$("#task-dialog-title").textContent=task?"Edit tugas":"Tambah tugas";openDialog("task-dialog");
}
function openNoteForm(note=null){
 $("#note-form").reset();$("#note-id").value=note?.id||"";$("#note-title").value=note?.title||"";$("#note-body").value=note?.body||"";$("#note-pinned").checked=!!note?.pinned;$("#note-dialog-title").textContent=note?"Edit catatan":"Catatan baru";openDialog("note-dialog");
}
function openHabitForm(h=null){
 $("#habit-form").reset();$("#habit-id").value=h?.id||"";$("#habit-title").value=h?.title||"";$("#habit-emoji").value=h?.emoji||"";$("#habit-category").value=h?.category||"Belajar";$("#habit-target").value=h?.target||"";
 document.querySelectorAll('input[name="habit-day"]').forEach(i=>i.checked=(h?.days||[1,2,3,4,5]).includes(Number(i.value)));
 $("#habit-dialog-title").textContent=h?"Edit kebiasaan":"Kebiasaan baru";openDialog("habit-dialog");
}
function saveTask(event){
 event.preventDefault();const id=$("#task-id").value,prev=data.tasks.find(t=>t.id===id),title=$("#task-title").value.trim();if(!title)return;
 const task={id:id||makeId(),title,category:$("#task-category").value,priority:$("#task-priority").value,dueAt:$("#task-due").value?new Date($("#task-due").value).toISOString():"",reminderAt:$("#task-reminder").value?new Date($("#task-reminder").value).toISOString():"",done:prev?.done||false,completedAt:prev?.completedAt||"",createdAt:prev?.createdAt||new Date().toISOString()};
 data.tasks=id?data.tasks.map(t=>t.id===id?task:t):[...data.tasks,task];saveData();closeDialogs();showToast(id?"Tugas diperbarui.":"Tugas ditambahkan.");render();
}
function saveNote(event){
 event.preventDefault();const id=$("#note-id").value,prev=data.notes.find(n=>n.id===id),title=$("#note-title").value.trim(),body=$("#note-body").value.trim();if(!title||!body)return;
 const note={id:id||makeId(),title,body,pinned:$("#note-pinned").checked,createdAt:prev?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 data.notes=id?data.notes.map(n=>n.id===id?note:n):[...data.notes,note];saveData();closeDialogs();showToast(id?"Catatan diperbarui.":"Catatan disimpan.");render();
}
function saveHabit(event){
 event.preventDefault();const id=$("#habit-id").value,prev=data.habits.find(h=>h.id===id),title=$("#habit-title").value.trim();if(!title)return;
 const days=[...document.querySelectorAll('input[name="habit-day"]:checked')].map(i=>Number(i.value));
 if(!days.length){showToast("Pilih setidaknya satu hari jadwal.");return;}
 const h={id:id||makeId(),title,emoji:$("#habit-emoji").value.trim()||"✦",category:$("#habit-category").value,target:$("#habit-target").value.trim(),days,checks:prev?.checks||[],createdAt:prev?.createdAt||new Date().toISOString()};
 data.habits=id?data.habits.map(x=>x.id===id?h:x):[...data.habits,h];saveData();closeDialogs();showToast(id?"Kebiasaan diperbarui.":"Kebiasaan ditambahkan.");render();
}
function toggleTask(id){const t=data.tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;t.completedAt=t.done?new Date().toISOString():"";saveData();render();}
 function controlTaskTimer(id,action){
  const t=data.tasks.find(x=>x.id===id);if(!t)return;const now=new Date().toISOString();
  if(action==="timer-start"){
   const other=data.tasks.find(x=>x.id!==id&&x.timerStartedAt);
   if(other){showToast("Selesaikan atau jeda timer tugas lain dulu.");return;}
   t.timerStartedAt=now;saveData();showToast("Timer pengerjaan dimulai.");
  }else if(action==="timer-pause"){
   t.timerAccumulatedMs=(Number(t.timerAccumulatedMs)||0)+Math.max(0,Date.now()-new Date(t.timerStartedAt).getTime());t.timerStartedAt=null;saveData();showToast("Timer dijeda.");
  }else if(action==="timer-finish"){
   const duration=Math.max(0,Number(t.timerAccumulatedMs)||0)+(t.timerStartedAt?Math.max(0,Date.now()-new Date(t.timerStartedAt).getTime()):0);
   if(duration>0){t.timeSessions=Array.isArray(t.timeSessions)?t.timeSessions:[];t.timeSessions.push({durationMs:duration,endedAt:now});t.timeSpentMs=(Number(t.timeSpentMs)||0)+duration;}
   t.timerStartedAt=null;t.timerAccumulatedMs=0;saveData();showToast(duration?"Sesi tersimpan ke total waktu tugas.":"Belum ada waktu yang tercatat.");
  }
  render();
 }
 function updateTaskTimers(){document.querySelectorAll("[data-task-timer]").forEach(el=>{const t=data.tasks.find(x=>x.id===el.dataset.taskTimer);if(t)el.textContent=formatDuration(taskElapsedMs(t));});}function toggleHabit(id,checked){const today=todayKey();data.habits=data.habits.map(h=>{if(h.id!==id)return h;const set=new Set(h.checks||[]);checked?set.add(today):set.delete(today);return {...h,checks:[...set].sort()};});saveData();render();}
function deleteItem(type,id){
 const labels={task:"tugas",note:"catatan",habit:"kebiasaan"};if(!confirm(`Hapus ${labels[type]} ini?`))return;
 if(type==="task")data.tasks=data.tasks.filter(x=>x.id!==id);if(type==="note")data.notes=data.notes.filter(x=>x.id!==id);if(type==="habit")data.habits=data.habits.filter(x=>x.id!==id);
 saveData();showToast(`${labels[type]} dihapus.`);render();
}
function exportBackup(){
 const blob=new Blob([JSON.stringify({app:"FocusDay",version:2,exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=`focusday-backup-${todayKey()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast("Backup berhasil dibuat.");
}
function importBackup(file){
 if(!file)return;const r=new FileReader();r.onload=()=>{try{const p=JSON.parse(r.result),incoming=p.data||p;if(!incoming||!Array.isArray(incoming.tasks)||!Array.isArray(incoming.notes)||!Array.isArray(incoming.habits))throw Error("Invalid backup");
 if(!confirm("Impor akan mengganti data lokal saat ini. Lanjutkan?"))return;
 data={tasks:incoming.tasks,notes:incoming.notes,habits:incoming.habits.map(h=>({...h,checks:h.checks||h.logs||[],days:h.days||[0,1,2,3,4,5,6],category:h.category||"Pribadi",target:h.target||""})),notifiedReminders:incoming.notifiedReminders||[]};saveData();render();showToast("Backup diimpor.");}catch(e){showToast("File backup tidak valid.");}finally{$("#import-file").value="";}};r.readAsText(file);
}
function enableNotifications(){if(!("Notification"in window)){showToast("Browser tidak mendukung notifikasi.");return;}Notification.requestPermission().then(p=>showToast(p==="granted"?"Izin notifikasi aktif.":"Izin notifikasi belum diberikan."));}
function checkReminders(){
 const due=data.tasks.filter(t=>!t.done&&t.reminderAt&&new Date(t.reminderAt).getTime()<=Date.now()&&!data.notifiedReminders.includes(t.id));
 due.forEach(t=>{showToast(`Pengingat: ${t.title}`);if("Notification"in window&&Notification.permission==="granted")try{new Notification("FocusDay — Pengingat",{body:t.title,tag:`focusday-${t.id}`});}catch(e){}data.notifiedReminders.push(t.id);});if(due.length)saveData();
}
function configureCloud(){
 const url=$("#supabase-url")?.value.trim(),key=$("#supabase-key")?.value.trim();if(!url||!key){showToast("Isi Project URL dan anon/public key terlebih dahulu.");return;}
 try{new URL(url);}catch(e){showToast("URL Supabase tidak valid.");return;}
 localStorage.setItem(SUPABASE_URL_KEY,url.replace(/\/$/,""));localStorage.setItem(SUPABASE_KEY_KEY,key);
 cloud=null;cloudUser=null;
 if(!window.supabase?.createClient){showToast("Library Supabase belum termuat. Periksa internet lalu refresh.");return;}
 cloud=window.supabase.createClient(url.replace(/\/$/,""),key);
 cloud.auth.onAuthStateChange((event,session)=>{cloudUser=session?.user||null;updateCloudStatus();if(event==="INITIAL_SESSION"&&cloudUser)setTimeout(()=>syncFromCloud(true),0);});
 showToast("Konfigurasi tersimpan. Masuk atau daftar untuk mengaktifkan sinkronisasi.");renderSettings();
}
function updateCloudStatus(msg){
 const el=$("#cloud-status");if(el)el.textContent=msg||(cloudUser?`Terhubung sebagai ${cloudUser.email}`:"Belum masuk. Data masih tersimpan lokal.");
 const side=document.querySelector(".sidebar-bottom");if(side)side.innerHTML=`<span class="status-dot"></span>${cloudUser?"Cloud sync aktif":"Data tersimpan di perangkat ini"}`;
}
async function cloudAuth(){
 const emailBefore=$("#cloud-email")?.value.trim(), passwordBefore=$("#cloud-password")?.value;
 if(!cloud){configureCloud();if(!cloud)return; if(emailBefore && $("#cloud-email")) $("#cloud-email").value=emailBefore; if(passwordBefore && $("#cloud-password")) $("#cloud-password").value=passwordBefore;}
 const area=$("#cloud-auth");if(area)area.hidden=false;
 const email=$("#cloud-email")?.value.trim(),password=$("#cloud-password")?.value;
 if(!email||!password){showToast("Masukkan email dan password di bagian sinkronisasi, lalu tekan Masuk / Daftar lagi.");return;}
 const {data:result,error}=await cloud.auth.signInWithPassword({email,password});
 if(error){const msg=String(error.message||"");if(msg.toLowerCase().includes("invalid login")||msg.toLowerCase().includes("email not confirmed")){
   const create=confirm("Login gagal. Mau mencoba membuat akun baru dengan email ini?");
   if(create){const res=await cloud.auth.signUp({email,password});if(res.error)showToast("Daftar gagal: "+res.error.message);else showToast("Pendaftaran dikirim. Jika verifikasi email aktif, cek email lalu login.");}
   else showToast("Login gagal: "+msg);
  }else showToast("Login gagal: "+msg);return;}
 cloudUser=result.user;showToast("Berhasil masuk. Mengambil data cloud…");await syncFromCloud(true);renderSettings();
}
async function syncToCloud(showMessage=true){
 if(!cloud||!cloudUser){if(showMessage)showToast("Konfigurasikan Supabase lalu masuk terlebih dahulu.");return;}
 if(cloudBusy)return;cloudBusy=true;
 try{
  const payload={user_id:cloudUser.id,payload:data,updated_at:new Date().toISOString()};
  const {error}=await cloud.from("focusday_data").upsert(payload,{onConflict:"user_id"});
  if(error)throw error;
  updateCloudStatus("Sinkronisasi berhasil · "+new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}));
  if(showMessage)showToast("Data berhasil dikirim ke cloud.");
 }catch(e){console.error(e);updateCloudStatus("Sync gagal: "+e.message);if(showMessage)showToast("Sync gagal. Cek koneksi dan SQL/RLS Supabase.");}
 finally{cloudBusy=false;}
}
async function syncFromCloud(showMessage=false){
 if(!cloud||!cloudUser){if(showMessage)showToast("Masuk ke akun cloud terlebih dahulu.");return;}
 if(cloudBusy)return;cloudBusy=true;
 try{
  const {data:row,error}=await cloud.from("focusday_data").select("payload,updated_at").eq("user_id",cloudUser.id).maybeSingle();
  if(error)throw error;
  if(row?.payload&&confirm("Data ditemukan di cloud. Muat data cloud ke perangkat ini? Pilih Batal untuk mempertahankan data lokal.")){
   const p=row.payload;if(!Array.isArray(p.tasks)||!Array.isArray(p.notes)||!Array.isArray(p.habits))throw Error("Format data cloud tidak valid");
   data={tasks:p.tasks,notes:p.notes,habits:p.habits.map(h=>({...h,checks:h.checks||[],days:h.days||[0,1,2,3,4,5,6]})),notifiedReminders:p.notifiedReminders||[]};localSave();render();showToast("Data cloud dimuat ke perangkat ini.");
  }else if(!row){const payload={user_id:cloudUser.id,payload:data,updated_at:new Date().toISOString()};const up=await cloud.from("focusday_data").upsert(payload,{onConflict:"user_id"});if(up.error)throw up.error;if(showMessage)showToast("Data lokal pertama kali disimpan ke cloud.");}
  else if(showMessage)showToast("Data lokal tidak diubah.");
 }catch(e){console.error(e);showToast("Gagal mengambil data: "+e.message);updateCloudStatus("Sync gagal: "+e.message);}
 finally{cloudBusy=false;}
}
async function signOutCloud(){
 if(!cloud){showToast("Belum ada konfigurasi cloud.");return;}
 const {error}=await cloud.auth.signOut();if(error){showToast("Gagal keluar: "+error.message);return;}cloudUser=null;updateCloudStatus("Keluar dari akun cloud. Data lokal tetap tersedia.");showToast("Berhasil keluar.");
}
function handleAction(a,id,value){
 if(a==="add-task")openTaskForm();if(a==="edit-task"){const t=data.tasks.find(x=>x.id===id);if(t)openTaskForm(t);}if(a==="delete-task")deleteItem("task",id);if(a==="toggle-task")toggleTask(id);if(a==="timer-start"||a==="timer-pause"||a==="timer-finish")controlTaskTimer(id,a);
 if(a==="add-note")openNoteForm();if(a==="edit-note"){const n=data.notes.find(x=>x.id===id);if(n)openNoteForm(n);}if(a==="delete-note")deleteItem("note",id);
 if(a==="add-habit")openHabitForm();if(a==="edit-habit"){const h=data.habits.find(x=>x.id===id);if(h)openHabitForm(h);}if(a==="delete-habit")deleteItem("habit",id);
 if(a==="toggle-habit"){const h=data.habits.find(x=>x.id===id);if(h)toggleHabit(id,value===undefined?!habitDone(h):value);}
 if(a==="task-filter"){taskFilter=value;renderTasks();}if(a==="habit-filter"){habitFilter=value;renderHabits();}
 if(a==="habit-history"){const p=$("#habit-history-panel");if(p)p.hidden=!p.hidden;}
 if(a==="export")exportBackup();if(a==="import")$("#import-file")?.click();if(a==="enable-notifications")enableNotifications();
 if(a==="reset"&&confirm("Hapus semua data lokal? Tindakan ini tidak bisa dibatalkan.")){data=defaultData();saveData();render();showToast("Data lokal dihapus.");}
 if(a==="configure-cloud")configureCloud();if(a==="cloud-signin")cloudAuth();if(a==="cloud-sync")syncToCloud(true);if(a==="cloud-signout")signOutCloud();
}
document.addEventListener("click",e=>{const v=e.target.closest("[data-view]");if(v){setView(v.dataset.view);return;}const b=e.target.closest("[data-action]");if(!b)return;handleAction(b.dataset.action,b.dataset.id,b.dataset.value);});
document.addEventListener("change",e=>{
 const t=e.target;
 if(t.matches('[data-action="toggle-task"]'))toggleTask(t.dataset.id,t.checked);
 if(t.matches('[data-action="toggle-habit"]'))toggleHabit(t.dataset.id,t.checked);
 if(t.id==="import-file")importBackup(t.files?.[0]);
});
document.addEventListener("input",e=>{
 if(e.target.id==="task-search"){const pos=e.target.selectionStart;taskSearch=e.target.value;renderTasks();const n=$("#task-search");n.focus();n.setSelectionRange(pos,pos);}
 if(e.target.id==="note-search"){const pos=e.target.selectionStart;noteSearch=e.target.value;renderNotes();const n=$("#note-search");n.focus();n.setSelectionRange(pos,pos);}
});
$("#task-form").addEventListener("submit",saveTask);$("#note-form").addEventListener("submit",saveNote);$("#habit-form").addEventListener("submit",saveHabit);
document.querySelectorAll(".close-dialog").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));
$("#quick-add").addEventListener("click",()=>openTaskForm());
document.addEventListener("click",e=>{if(e.target.matches("#cloud-auth button"))return;});
$("#today-label").textContent=new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date()).toUpperCase();
render();setInterval(checkReminders,15000);setInterval(updateTaskTimers,1000);checkReminders();
window.addEventListener("online",()=>{if(cloudUser)syncToCloud(false);});
