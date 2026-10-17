import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, collection, setDoc, getDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── FIREBASE CONFIG ──────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCWeNalYSBd_V3J9stYs3vSwKNkw5ONbhA",
  authDomain: "habbit-tracker-142a5.firebaseapp.com",
  projectId: "habbit-tracker-142a5",
  storageBucket: "habbit-tracker-142a5.firebasestorage.app",
  messagingSenderId: "20204715545",
  appId: "1:20204715545:web:3240f62a1aa292e5d7f488"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── CONSTANTS ────────────────────────────────────────────────────────────
const COLORS  = ['#7c5cfc','#f7c948','#3ee8b5','#ff4f6d','#4fa3ff','#ff8c42','#b6ff6f','#ff6bff'];
const EMOJIS  = ['💪','💻','📚','🚶','🏃','🧘','🎯','⚡','🎵','✍️','🌿','🍎','💤','🧠','🔥','🎨'];
const DAYS    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── STATE ────────────────────────────────────────────────────────────────
let currentUser = null;
let habits = [];
let logs   = {};
let unsubHabits = null;
let unsubLogs   = null;
let editingId = null;
let selColor = COLORS[0];
let selEmoji = EMOJIS[0];

// ── ACTIVE DATE STATE ────────────────────────────────────────────────────
let activeDate = todayStr(); // YYYY-MM-DD of the date being viewed on dashboard

// ── HELPERS ──────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function dateStr(d) {
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function p(n) { return String(n).padStart(2,'0'); }
function parseDateLocal(str) {
  // Parse YYYY-MM-DD as local date (avoid UTC shift)
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}
function offsetDate(str, days) {
  const d = parseDateLocal(str);
  d.setDate(d.getDate() + days);
  return dateStr(d);
}
function formatDateLabel(str) {
  const today = todayStr();
  const yesterday = offsetDate(today, -1);
  if (str === today) return 'Today';
  if (str === yesterday) return 'Yesterday';
  const d = parseDateLocal(str);
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}
function formatDateFull(str) {
  const d = parseDateLocal(str);
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}

// ── DATE NAVIGATION ───────────────────────────────────────────────────────
function setActiveDate(dateString) {
  const today = todayStr();
  // Don't allow future dates
  if (dateString > today) dateString = today;
  activeDate = dateString;
  updateDateNavUI();
  renderDashboard();
}

function updateDateNavUI() {
  const today = todayStr();
  const isToday = activeDate === today;
  const label = document.getElementById('dateNavLabel');
  const nextBtn = document.getElementById('nextDayBtn');
  const goTodayBtn = document.getElementById('goTodayBtn');
  const banner = document.getElementById('pastDayBanner');
  const pastLabel = document.getElementById('pastDayLabel');
  const dashTitle = document.getElementById('dashTitle');

  label.textContent = formatDateLabel(activeDate);
  label.classList.toggle('past', !isToday);
  nextBtn.disabled = isToday;
  goTodayBtn.classList.toggle('hidden', isToday);

  if (!isToday) {
    banner.classList.add('visible');
    pastLabel.textContent = formatDateFull(activeDate);
    dashTitle.innerHTML = `Past <span>Day</span>`;
  } else {
    banner.classList.remove('visible');
    dashTitle.innerHTML = `Today's <span>Grind</span>`;
  }
}

window.goToToday = function() { setActiveDate(todayStr()); };

document.getElementById('prevDayBtn').addEventListener('click', () => {
  setActiveDate(offsetDate(activeDate, -1));
});
document.getElementById('nextDayBtn').addEventListener('click', () => {
  setActiveDate(offsetDate(activeDate, 1));
});

// ── DATE PICKER ───────────────────────────────────────────────────────────
window.openDatePicker = function() {
  const input = document.getElementById('datePickerInput');
  input.value = activeDate;
  input.max = todayStr();
  // Set a reasonable min (e.g. 2 years ago)
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 2);
  input.min = dateStr(minDate);
  document.getElementById('datePickerModal').classList.add('open');
};

document.getElementById('cancelDatePicker').addEventListener('click', () => {
  document.getElementById('datePickerModal').classList.remove('open');
});
document.getElementById('datePickerModal').addEventListener('click', e => {
  if (e.target === document.getElementById('datePickerModal'))
    document.getElementById('datePickerModal').classList.remove('open');
});
document.getElementById('confirmDatePicker').addEventListener('click', () => {
  const val = document.getElementById('datePickerInput').value;
  if (val) {
    setActiveDate(val);
    document.getElementById('datePickerModal').classList.remove('open');
  }
});

// ── SYNC INDICATOR ───────────────────────────────────────────────────────
function setSyncing(){ document.getElementById('syncDot').className='sync-dot syncing'; document.getElementById('syncLabel').textContent='Syncing...'; }
function setSynced() { document.getElementById('syncDot').className='sync-dot'; document.getElementById('syncLabel').textContent='Synced'; }
function setSyncErr(){ document.getElementById('syncDot').className='sync-dot error'; document.getElementById('syncLabel').textContent='Sync error'; }

// ── AUTH ─────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    showApp(user);
    startListeners(user.uid);
  } else {
    currentUser = null;
    stopListeners();
    showLogin();
  }
});

document.getElementById('googleSignInBtn').addEventListener('click', async () => {
  const btn = document.getElementById('googleSignInBtn');
  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch(e) {
    showToast('❌ Sign in failed. Try again.');
    btn.disabled = false;
    btn.innerHTML = GOOGLE_BTN_HTML;
  }
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  if (confirm('Sign out of Habbit Tracker?')) { await signOut(auth); }
});

// ── SHOW / HIDE SCREENS ───────────────────────────────────────────────────
function showApp(user){
  document.getElementById('loadingScreen').style.display='none';
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appScreen').style.display='block';
  document.getElementById('userName').textContent = user.displayName || 'User';
  document.getElementById('userEmail').textContent = user.email || '';
  const oldAvatar = document.getElementById('userAvatar');
  let newAvatar;
  if (user.photoURL) {
    newAvatar = document.createElement('img');
    newAvatar.src = user.photoURL;
    newAvatar.className = 'user-avatar';
  } else {
    newAvatar = document.createElement('div');
    newAvatar.className = 'user-avatar-placeholder';
    newAvatar.textContent = (user.displayName||'U')[0].toUpperCase();
  }
  newAvatar.id = 'userAvatar';
  oldAvatar.replaceWith(newAvatar);
  // Init date nav
  activeDate = todayStr();
  updateDateNavUI();
}

const GOOGLE_BTN_HTML = document.getElementById('googleSignInBtn').innerHTML;

function showLogin(){
  document.getElementById('loadingScreen').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('appScreen').style.display='none';
  const btn = document.getElementById('googleSignInBtn');
  btn.disabled = false;
  btn.innerHTML = GOOGLE_BTN_HTML;
}

// ── FIRESTORE LISTENERS ───────────────────────────────────────────────────
function startListeners(uid){
  const habitsRef = collection(db,'users',uid,'habits');
  unsubHabits = onSnapshot(query(habitsRef, orderBy('createdAt','asc')), snap => {
    habits = snap.docs.map(d => ({id:d.id, ...d.data()}));
    if(habits.length === 0) addDefaultHabits(uid);
    renderAll();
    setSynced();
  }, () => setSyncErr());

  const logsRef = collection(db,'users',uid,'logs');
  unsubLogs = onSnapshot(logsRef, snap => {
    logs = {};
    snap.docs.forEach(d => { logs[d.id] = d.data(); });
    renderAll();
    setSynced();
  }, () => setSyncErr());
}

function stopListeners(){
  if(unsubHabits){ unsubHabits(); unsubHabits=null; }
  if(unsubLogs){ unsubLogs(); unsubLogs=null; }
  habits=[]; logs={}; defaultsChecked=false;
}

// ── DEFAULT HABITS ────────────────────────────────────────────────────────
let defaultsChecked = false;

async function addDefaultHabits(userId){
  if(defaultsChecked) return;
  defaultsChecked = true;
  try {
    const userRef = doc(db,'users',userId);
    const snap = await getDoc(userRef);
    if(snap.exists() && snap.data().defaultsAdded) return;

    await setDoc(userRef, { defaultsAdded: true }, { merge:true });

    const defaults = [
      { name:'Gym Workout',      emoji:'💪', color:'#7c5cfc', goal:'60 minutes' },
      { name:'Coding Practice',  emoji:'💻', color:'#4fa3ff', goal:'2 hours daily' },
      { name:'Study Session',    emoji:'📚', color:'#f7c948', goal:'Deep focus work' },
      { name:'30-min Walk',      emoji:'🚶', color:'#3ee8b5', goal:'30 minutes outside' },
    ];
    for(const h of defaults){
      const ref = doc(collection(db,'users',userId,'habits'));
      await setDoc(ref, {...h, createdAt: serverTimestamp()});
    }
  } catch(e){
    defaultsChecked = false;
  }
}

// ── RENDER ALL ────────────────────────────────────────────────────────────
function renderAll(){
  const activePage = document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
  if(activePage==='dashboard') renderDashboard();
  if(activePage==='weekly')    renderWeekly();
  if(activePage==='monthly')   renderMonthly();
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('page-'+item.dataset.page).classList.add('active');
    closeSidebar();
    if(item.dataset.page==='weekly')    renderWeekly();
    if(item.dataset.page==='monthly')   renderMonthly();
    if(item.dataset.page==='dashboard') renderDashboard();
  });
});

document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
});
document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
function closeSidebar(){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }

// ── DASHBOARD ─────────────────────────────────────────────────────────────
function renderDashboard(){
  const dayLog = logs[activeDate] || {};
  const total  = habits.length;
  const done   = habits.filter(h => dayLog[h.id]).length;
  const pct    = total ? Math.round(done/total*100) : 0;

  document.getElementById('stat-today').textContent = pct+'%';
  document.getElementById('stat-done-count').textContent = `${done} of ${total} done`;
  document.getElementById('stat-habits').textContent = total;

  const streaks = habits.map(h => computeStreak(h.id));
  const best    = streaks.length ? Math.max(...streaks) : 0;
  const bestH   = habits[streaks.indexOf(best)];
  document.getElementById('stat-streak').textContent = best+' 🔥';
  document.getElementById('stat-streak-label').textContent = bestH?.name || '—';

  const ws = getWeekScores();
  const wAvg = ws.length ? Math.round(ws.reduce((a,b)=>a+b,0)/ws.length) : 0;
  document.getElementById('stat-week').textContent = wAvg+'%';

  // Ring
  const offset = 314 - (pct/100*314);
  document.getElementById('ringFill').style.strokeDashoffset = offset;
  document.getElementById('ringPct').textContent = pct+'%';
  document.getElementById('ringFill').style.stroke = pct>=80?'#3ee8b5':pct>=50?'#7c5cfc':'#f7c948';

  // Habits list
  const list = document.getElementById('habitsList');
  if(!habits.length){
    list.innerHTML=`<div class="empty-state"><div class="big">🌱</div><p>No habits yet. Add your first one!</p></div>`;
  } else {
    list.innerHTML = habits.map(h => {
      const isDone  = !!dayLog[h.id];
      const streak  = computeStreak(h.id);
      return `<div class="habit-item${isDone?' done':''}" style="--habit-color:${h.color}">
        <button class="check-btn" onclick="toggleHabit('${h.id}')">${isDone?'✓':''}</button>
        <div class="habit-info">
          <div class="habit-name">${h.emoji} ${h.name}</div>
          <div class="habit-meta"><span>${h.goal||'Daily habit'}</span><span>🔥 ${streak} day streak</span></div>
        </div>
        <div class="habit-actions">
          <button class="action-btn" onclick="openEdit('${h.id}')">✏️</button>
          <button class="action-btn del" onclick="deleteHabit('${h.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  renderMiniWeekBars('weekBars');

  // Streaks panel
  const sl = document.getElementById('streakList');
  if(!habits.length){ sl.innerHTML=`<div style="font-size:0.75rem;color:var(--muted);padding:12px 0">Add habits to see streaks</div>`; }
  else {
    sl.innerHTML = [...habits].sort((a,b)=>computeStreak(b.id)-computeStreak(a.id))
      .map(h=>`<div class="streak-row"><span>${h.emoji} ${h.name}</span><span class="streak-count">${computeStreak(h.id)} 🔥</span></div>`).join('');
  }

  updateDateNavUI();
}

// ── TOGGLE HABIT (uses activeDate) ───────────────────────────────────────
window.toggleHabit = async function(habitId){
  if(!currentUser) return;
  setSyncing();
  const logRef = doc(db,'users',currentUser.uid,'logs',activeDate);
  const current = (logs[activeDate]||{})[habitId];
  try {
    if(current){
      const { [habitId]: _, ...rest } = (logs[activeDate]||{});
      await setDoc(logRef, rest);
      showToast('↩️ Habit unmarked');
    } else {
      await setDoc(logRef, { ...(logs[activeDate]||{}), [habitId]: true }, {merge:true});
      const isToday = activeDate === todayStr();
      showToast(isToday ? '✅ Habit marked complete!' : '✅ Habit marked for ' + formatDateLabel(activeDate) + '!');
    }
    setSynced();
  } catch(e){ setSyncErr(); showToast('❌ Sync failed. Check connection.'); }
};

// ── DELETE HABIT ──────────────────────────────────────────────────────────
window.deleteHabit = async function(id){
  if(!confirm('Delete this habit? This cannot be undone.')) return;
  if(!currentUser) return;
  setSyncing();
  try {
    await deleteDoc(doc(db,'users',currentUser.uid,'habits',id));
    showToast('🗑️ Habit deleted');
    setSynced();
  } catch(e){ setSyncErr(); showToast('❌ Delete failed'); }
};

// ── MODAL ─────────────────────────────────────────────────────────────────
function buildColorPicker(){
  document.getElementById('colorPicker').innerHTML = COLORS.map(c=>`<div class="color-dot${c===selColor?' selected':''}" style="background:${c}" onclick="selColorFn('${c}')"></div>`).join('');
}
function buildEmojiPicker(){
  document.getElementById('emojiPicker').innerHTML = EMOJIS.map(e=>`<div class="emoji-opt${e===selEmoji?' selected':''}" onclick="selEmojiFn('${e}')">${e}</div>`).join('');
}
window.selColorFn = c => { selColor=c; buildColorPicker(); };
window.selEmojiFn = e => { selEmoji=e; buildEmojiPicker(); };

document.getElementById('addHabitBtn').addEventListener('click', () => {
  editingId=null; selColor=COLORS[0]; selEmoji=EMOJIS[0];
  document.getElementById('habitName').value='';
  document.getElementById('habitGoal').value='';
  document.getElementById('modalTitle').textContent='New Habit';
  buildColorPicker(); buildEmojiPicker();
  document.getElementById('habitModal').classList.add('open');
});

window.openEdit = function(id){
  const h = habits.find(x=>x.id===id); if(!h) return;
  editingId=id; selColor=h.color; selEmoji=h.emoji;
  document.getElementById('habitName').value=h.name;
  document.getElementById('habitGoal').value=h.goal||'';
  document.getElementById('modalTitle').textContent='Edit Habit';
  buildColorPicker(); buildEmojiPicker();
  document.getElementById('habitModal').classList.add('open');
};

document.getElementById('cancelModal').addEventListener('click', () => document.getElementById('habitModal').classList.remove('open'));
document.getElementById('habitModal').addEventListener('click', e => { if(e.target===document.getElementById('habitModal')) document.getElementById('habitModal').classList.remove('open'); });

document.getElementById('saveHabit').addEventListener('click', async () => {
  const name = document.getElementById('habitName').value.trim();
  if(!name){ showToast('⚠️ Please enter a habit name'); return; }
  if(!currentUser) return;
  setSyncing();
  const data = { name, emoji:selEmoji, color:selColor, goal:document.getElementById('habitGoal').value.trim() };
  try {
    if(editingId){
      await setDoc(doc(db,'users',currentUser.uid,'habits',editingId), data, {merge:true});
      showToast('✏️ Habit updated!');
    } else {
      const ref = doc(collection(db,'users',currentUser.uid,'habits'));
      await setDoc(ref, {...data, createdAt: serverTimestamp()});
      showToast('🎉 Habit added!');
    }
    document.getElementById('habitModal').classList.remove('open');
    setSynced();
  } catch(e){ setSyncErr(); showToast('❌ Save failed'); }
});

// ── STREAK ────────────────────────────────────────────────────────────────
function computeStreak(habitId){
  let streak=0, d=new Date();
  const today=todayStr();
  if(!(logs[today]&&logs[today][habitId])) d.setDate(d.getDate()-1);
  while(true){
    const ds=dateStr(d);
    if(logs[ds]&&logs[ds][habitId]){ streak++; d.setDate(d.getDate()-1); } else break;
  }
  return streak;
}

// ── WEEK HELPERS ──────────────────────────────────────────────────────────
function getWeekDays(){
  const today=new Date(); const dow=today.getDay();
  return Array.from({length:7},(_,i)=>{ const d=new Date(today); d.setDate(today.getDate()-dow+i); return {date:dateStr(d),label:DAYS[i]}; });
}
function getWeekScores(){
  return getWeekDays().map(({date}) => {
    const log=logs[date]||{};
    const done=habits.filter(h=>log[h.id]).length;
    return habits.length ? Math.round(done/habits.length*100) : 0;
  });
}

function renderMiniWeekBars(id){
  const el=document.getElementById(id); if(!el) return;
  const today = todayStr();
  el.innerHTML = getWeekDays().map(({date,label})=>{
    const log=logs[date]||{};
    const done=habits.filter(h=>log[h.id]).length;
    const pct=habits.length?Math.round(done/habits.length*100):0;
    const cls=pct>=80?'good':pct>=50?'mid':pct>0?'low':'';
    const isActive = date === activeDate;
    const isToday = date === today;
    const dayLabelCls = isToday ? 'bar-day current-day' : 'bar-day';
    const barStyle = isActive ? `height:${Math.max(pct,4)}px;max-height:80px;outline:2px solid var(--accent2);outline-offset:2px;` : `height:${Math.max(pct,4)}px;max-height:80px;`;
    return `<div class="bar-col" onclick="setActiveDateFromBar('${date}')" style="cursor:pointer;opacity:${date > today ? 0.3 : 1}">
      <div class="bar-pct">${pct?pct+'%':''}</div>
      <div class="bar-wrap"><div class="bar ${cls}" style="${barStyle}"></div></div>
      <div class="${dayLabelCls}">${label}</div>
    </div>`;
  }).join('');
}

window.setActiveDateFromBar = function(date) {
  if (date <= todayStr()) setActiveDate(date);
};

// ── WEEKLY ────────────────────────────────────────────────────────────────
function renderWeekly(){
  const days=getWeekDays(); const scores=getWeekScores();
  const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0;
  const bestIdx=scores.indexOf(Math.max(...scores));
  const totalDone=days.reduce((acc,{date})=>{ const log=logs[date]||{}; return acc+habits.filter(h=>log[h.id]).length; },0);
  const totalMissed=days.reduce((acc,{date})=>{ const log=logs[date]||{}; return acc+habits.filter(h=>!log[h.id]).length; },0);

  document.getElementById('weekRange').textContent=`${parseDateLocal(days[0].date).toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${parseDateLocal(days[6].date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
  document.getElementById('w-avg').textContent=avg+'%';
  document.getElementById('w-best-day').textContent=days[bestIdx]?.label||'—';
  document.getElementById('w-best-day-val').textContent=(scores[bestIdx]||0)+'%';
  document.getElementById('w-total').textContent=totalDone;
  document.getElementById('w-missed').textContent=totalMissed;

  renderMiniWeekBars('weeklyBars');

  const hb=document.getElementById('habitBars');
  hb.innerHTML=habits.length?habits.map(h=>{
    const done=days.filter(({date})=>logs[date]&&logs[date][h.id]).length;
    const pct=Math.round(done/7*100);
    return `<div class="habit-bar-row"><div class="habit-bar-label">${h.emoji} ${h.name}</div><div class="habit-bar-track"><div class="habit-bar-fill" style="width:${pct}%;background:${h.color}"></div></div><div class="habit-bar-pct">${pct}%</div></div>`;
  }).join(''):'<div style="font-size:0.8rem;color:var(--muted)">No habits yet</div>';

  const ws=document.getElementById('weekStreaks');
  ws.innerHTML=habits.length?[...habits].map(h=>({...h,s:computeStreak(h.id)})).sort((a,b)=>b.s-a.s)
    .map((h,i)=>`<div class="highlight-row"><span>${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)} ${h.emoji} ${h.name}</span><span class="highlight-val" style="color:${h.color}">${h.s} 🔥</span></div>`).join('')
    :'<div style="font-size:0.8rem;color:var(--muted)">No habits yet</div>';
}

// ── MONTHLY ───────────────────────────────────────────────────────────────
function renderMonthly(){
  const now=new Date(); const year=now.getFullYear(); const month=now.getMonth();
  const daysInMonth=new Date(year,month+1,0).getDate();
  document.getElementById('monthName').textContent=now.toLocaleDateString('en-US',{month:'long',year:'numeric'});

  const monthDates=Array.from({length:daysInMonth},(_,i)=>({date:`${year}-${p(month+1)}-${p(i+1)}`,day:i+1}));
  const scores=monthDates.map(({date})=>{ const log=logs[date]||{}; const done=habits.filter(h=>log[h.id]).length; return habits.length?Math.round(done/habits.length*100):0; });
  const activeDays=scores.filter(s=>s>0).length;
  const avg=activeDays?Math.round(scores.filter(s=>s>0).reduce((a,b)=>a+b,0)/activeDays):0;
  const perfect=scores.filter(s=>s===100).length;
  const missed=monthDates.filter(({date})=>habits.length&&habits.every(h=>!(logs[date]&&logs[date][h.id]))&&date<=todayStr()).length;
  let best=0,cur=0; for(const s of scores){ cur=s>0?cur+1:0; best=Math.max(best,cur); }

  document.getElementById('m-avg').textContent=avg+'%';
  document.getElementById('m-perfect').textContent=perfect;
  document.getElementById('m-streak').textContent=best+' 🔥';
  document.getElementById('m-missed').textContent=missed;

  const cal=document.getElementById('monthCalendar');
  const firstDow=new Date(year,month,1).getDay();
  let cells=''; for(let i=0;i<firstDow;i++) cells+='<div></div>';
  monthDates.forEach(({date,day},idx)=>{
    const s=scores[idx];
    const cls=s===100?'perfect':s>=70?'good':s>=40?'mid':s>0?'partial':date<=todayStr()?'has-data':'';
    // Highlight if this day matches activeDate
    const isActive = date === activeDate;
    const extraStyle = isActive ? 'outline:2px solid var(--accent2);outline-offset:1px;' : '';
    cells+=`<div class="cal-cell ${cls}" title="${date}: ${s}%" style="${extraStyle}" onclick="jumpToDayFromCal('${date}')">${day}</div>`;
  });
  cal.innerHTML=cells;

  const mhb=document.getElementById('monthHabitBars');
  mhb.innerHTML=habits.length?[...habits].map(h=>({ ...h, pct:Math.round(monthDates.filter(({date})=>logs[date]&&logs[date][h.id]).length/daysInMonth*100) }))
    .sort((a,b)=>b.pct-a.pct).map(h=>`<div class="habit-bar-row"><div class="habit-bar-label">${h.emoji} ${h.name}</div><div class="habit-bar-track"><div class="habit-bar-fill" style="width:${h.pct}%;background:${h.color}"></div></div><div class="habit-bar-pct">${h.pct}%</div></div>`).join('')
    :'<div style="font-size:0.8rem;color:var(--muted)">No habits yet</div>';

  const totalDone=monthDates.reduce((acc,{date})=>acc+habits.filter(h=>logs[date]&&logs[date][h.id]).length,0);
  const totalPossible=habits.length*daysInMonth;
  document.getElementById('monthHighlights').innerHTML=`
    <div class="highlight-row"><span>Total Completions</span><span class="highlight-val">${totalDone}</span></div>
    <div class="highlight-row"><span>Total Possible</span><span class="highlight-val">${totalPossible}</span></div>
    <div class="highlight-row"><span>Overall Rate</span><span class="highlight-val">${totalPossible?Math.round(totalDone/totalPossible*100):0}%</span></div>
    <div class="highlight-row"><span>Active Days</span><span class="highlight-val">${activeDays}</span></div>
    <div class="highlight-row"><span>Perfect Days</span><span class="highlight-val" style="color:var(--accent3)">${perfect} 🏆</span></div>`;
}

// Jump to a day from calendar click and go to dashboard
window.jumpToDayFromCal = function(date) {
  if (date > todayStr()) return;
  setActiveDate(date);
  // Switch to dashboard
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-page="dashboard"]').classList.add('active');
  document.getElementById('page-dashboard').classList.add('active');
};

// ── TOAST ─────────────────────────────────────────────────────────────────
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800); }
window.showToast = showToast;

// ── INIT ──────────────────────────────────────────────────────────────────
setTimeout(()=>{ if(document.getElementById('loadingScreen').style.display!=='none'&&!currentUser){ showLogin(); } },3000);
