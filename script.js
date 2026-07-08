const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const DOW_FULL = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const SWATCHES = ['#6B2E4F','#3E6E5E','#B4772F','#3D5A80','#8E4162','#5B7B4A','#A6432F','#4A5859'];

let state = { categories: [], tasks: [], view: 'week', activeDay: (new Date().getDay()+6)%7 };
let suppressNextClick = false;
let dragState = null;
let longPressTimer = null;
let dragCandidateEl = null;
let dragStartX = 0, dragStartY = 0;

function uid(){ return Math.random().toString(36).slice(2,10); }

function formatDateKey(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseDateKey(key){
  const [y,m,d] = key.split('-').map(Number);
  return new Date(y, m-1, d);
}

async function loadState(){
  try{
    const cats = localStorage.getItem('planner_categories');
    const tasks = localStorage.getItem('planner_tasks');
    if(cats) state.categories = JSON.parse(cats);
    if(tasks) state.tasks = JSON.parse(tasks);
  }catch(e){ /* first run, nothing stored yet */ }

  if(!state.categories.length){
    state.categories = [
      {id:uid(), name:'Языки', color:'#6B2E4F'},
      {id:uid(), name:'Тело', color:'#3E6E5E'},
      {id:uid(), name:'Мозг', color:'#3D5A80'},
      {id:uid(), name:'Доход', color:'#B4772F'},
    ];
    await saveCategories();
  }
  render();
}
async function saveCategories(){ try{ localStorage.setItem('planner_categories', JSON.stringify(state.categories)); }catch(e){} }
async function saveTasks(){ try{ localStorage.setItem('planner_tasks', JSON.stringify(state.tasks)); }catch(e){} }

function catById(id){ return state.categories.find(c=>c.id===id) || {name:'Без категории', color:'#5B5A54'}; }

function todayKey(){
  return formatDateKey(new Date());
}
function mondayOfWeek(d){
  const day = (d.getDay()+6)%7; // 0=Пн
  const monday = new Date(d);
  monday.setDate(d.getDate()-day);
  return monday;
}
function dateKeyForDayIndex(dayIndex){
  const monday = mondayOfWeek(new Date());
  const target = new Date(monday);
  target.setDate(monday.getDate()+dayIndex);
  return formatDateKey(target);
}

function render(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Мой план</h1>
        <div class="sub">Расписание, которое я строю сама</div>
      </div>
      <div class="topbar-right">
        <div class="date-pill">${new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</div>
        <button class="menu-btn" id="lockSettingsBtn" aria-label="Пароль">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </button>
        <button class="menu-btn" id="backupBtn" aria-label="Резервная копия">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
    </div>
    <div class="views">
      <button data-view="week" class="${state.view==='week'?'active':''}">Неделя</button>
      <button data-view="calendar" class="${state.view==='calendar'?'active':''}">Календарь</button>
    </div>
    <div id="viewRoot"></div>
  `;
  document.querySelectorAll('.views button').forEach(b=>{
    b.onclick = ()=>{ state.view = b.dataset.view; render(); };
  });
  const backupBtn = document.getElementById('backupBtn');
  if(backupBtn) backupBtn.onclick = openBackupSheet;
  const lockBtn = document.getElementById('lockSettingsBtn');
  if(lockBtn) lockBtn.onclick = openLockSettingsSheet;
  if(state.view === 'week') renderWeek();
  else renderCalendar();
}

function tasksForDate(dateKey){
  const dayIndex = (parseDateKey(dateKey).getDay()+6)%7;
  return state.tasks.filter(t=>{
    const isRecurring = t.recurring !== false; // старые дела без этого поля = повторяющиеся
    if(isRecurring) return (t.days||[]).includes(dayIndex);
    return (t.dates||[]).includes(dateKey);
  });
}
function isDoneOn(task, dateStr){
  return !!task.log[dateStr];
}

function renderWeek(){
  const root = document.getElementById('viewRoot');
  const todayIdx = (new Date().getDay()+6)%7;
  const dKey = dateKeyForDayIndex(state.activeDay);
  const dayTasks = tasksForDate(dKey);
  const isToday = state.activeDay === todayIdx;
  const doneCount = dayTasks.filter(t=>isDoneOn(t,dKey)).length;
  const pct = dayTasks.length ? Math.round(doneCount/dayTasks.length*100) : 0;

  root.innerHTML = `
    <div class="daytabs">
      ${DOW.map((d,i)=>`
        <button data-day="${i}" class="${i===state.activeDay?'active':''}">
          ${d}${i===todayIdx?'<span class="today-dot"></span>':''}
        </button>`).join('')}
    </div>
    <div class="day-progress">
      <svg class="ring" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#D9D0BC" stroke-width="4"/>
        <circle cx="22" cy="22" r="18" fill="none" stroke="#6B2E4F" stroke-width="4" stroke-linecap="round"
          stroke-dasharray="${2*Math.PI*18}" stroke-dashoffset="${2*Math.PI*18*(1-pct/100)}" transform="rotate(-90 22 22)"/>
      </svg>
      <div class="txt">
        <div class="n">${pct}% ${isToday ? 'сегодня' : DOW_FULL[state.activeDay].toLowerCase()}</div>
        <div class="s">${doneCount} из ${dayTasks.length} сделано</div>
      </div>
    </div>
    <div id="taskListRoot"></div>
  `;

  document.querySelectorAll('.daytabs button').forEach(b=>{
    b.onclick = ()=>{ state.activeDay = parseInt(b.dataset.day); render(); };
  });
  renderTaskList(dayTasks, dKey);
}

function taskCardHtml(t, dKey){
  const cat = catById(t.categoryId);
  const done = isDoneOn(t, dKey);
  return `
    <div class="task ${done?'done':''}" style="--cat-color:${cat.color}" data-drag-id="${t.id}">
      <div class="check ${done?'checked':''}" data-taskid="${t.id}">
        <svg viewBox="0 0 24 24"><polyline points="4 12 9 18 20 6"/></svg>
      </div>
      <div class="task-body" data-openid="${t.id}">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta"><span class="task-cat">${escapeHtml(cat.name)}</span></div>
        ${done && t.log[dKey] && t.log[dKey].note ? `<div class="task-note">${escapeHtml(t.log[dKey].note)}</div>` : ''}
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-editid="${t.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
      </div>
    </div>`;
}

function renderTaskList(dayTasks, dKey){
  const root = document.getElementById('taskListRoot');
  const recurring = dayTasks.filter(t=>t.recurring!==false).sort((a,b)=>(a.order||0)-(b.order||0));
  const once = dayTasks.filter(t=>t.recurring===false).sort((a,b)=>(a.order||0)-(b.order||0));

  if(!recurring.length && !once.length){
    root.innerHTML = `<div class="empty"><div class="display">Пока пусто</div><p>Нажми + и добавь первое дело на этот день</p></div>`;
    return;
  }

  root.innerHTML = `
    <div class="task-group" data-group="recurring">${recurring.map(t=>taskCardHtml(t,dKey)).join('')}</div>
    ${once.length ? `<div class="section-divider"></div><div class="task-group" data-group="once">${once.map(t=>taskCardHtml(t,dKey)).join('')}</div>` : ''}
  `;

  root.querySelectorAll('.check').forEach(el=>{
    el.onclick = ()=>{ if(suppressNextClick) return; toggleDone(el.dataset.taskid, dKey); };
  });
  root.querySelectorAll('[data-editid]').forEach(el=>{
    el.onclick = ()=>{ if(suppressNextClick) return; openTaskSheet(el.dataset.editid); };
  });
  root.querySelectorAll('[data-openid]').forEach(el=>{
    el.onclick = ()=>{
      if(suppressNextClick) return;
      const t = state.tasks.find(x=>x.id===el.dataset.openid);
      if(isDoneOn(t, dKey)) openNoteSheet(t.id, dKey);
    };
  });

  root.querySelectorAll('.task-group').forEach(groupEl=>{
    attachDragHandlers(groupEl);
  });
}

/* ---------- Drag reorder ---------- */
function attachDragHandlers(groupEl){
  groupEl.querySelectorAll('.task').forEach(taskEl=>{
    taskEl.addEventListener('pointerdown', (e)=>{
      if(e.target.closest('.check') || e.target.closest('.icon-btn')) return;
      dragCandidateEl = taskEl;
      dragStartX = e.clientX; dragStartY = e.clientY;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(()=>{ startDrag(taskEl, groupEl, e.clientY); }, 320);
    });
  });
}
function cancelLongPress(){ clearTimeout(longPressTimer); dragCandidateEl = null; }

document.addEventListener('pointermove', (e)=>{
  if(dragCandidateEl && !dragState){
    if(Math.abs(e.clientX-dragStartX)>10 || Math.abs(e.clientY-dragStartY)>10) cancelLongPress();
  }
  if(dragState){ e.preventDefault(); moveDrag(e.clientY); }
}, {passive:false});
document.addEventListener('pointerup', ()=>{ cancelLongPress(); if(dragState) endDrag(); });
document.addEventListener('pointercancel', ()=>{ cancelLongPress(); if(dragState) endDrag(); });

function startDrag(taskEl, groupEl, clientY){
  const rect = taskEl.getBoundingClientRect();
  const placeholder = document.createElement('div');
  placeholder.className = 'task-placeholder';
  placeholder.style.height = rect.height+'px';
  taskEl.parentNode.insertBefore(placeholder, taskEl);
  dragState = { taskEl, groupEl, placeholder, offsetY: clientY-rect.top };
  taskEl.style.position='fixed';
  taskEl.style.left=rect.left+'px'; taskEl.style.top=rect.top+'px'; taskEl.style.width=rect.width+'px';
  taskEl.style.zIndex=999;
  taskEl.classList.add('dragging-ghost');
  if(navigator.vibrate) navigator.vibrate(8);
}
function moveDrag(clientY){
  const {taskEl, groupEl, offsetY, placeholder} = dragState;
  taskEl.style.top = (clientY-offsetY)+'px';
  const siblings = Array.from(groupEl.querySelectorAll('.task:not(.dragging-ghost)'));
  for(const sib of siblings){
    const r = sib.getBoundingClientRect();
    const midY = r.top + r.height/2;
    if(clientY < midY){ groupEl.insertBefore(placeholder, sib); break; }
    if(sib === siblings[siblings.length-1]) groupEl.appendChild(placeholder);
  }
}
async function endDrag(){
  const {taskEl, groupEl, placeholder} = dragState;
  groupEl.insertBefore(taskEl, placeholder);
  placeholder.remove();
  taskEl.style.position=''; taskEl.style.left=''; taskEl.style.top=''; taskEl.style.width=''; taskEl.style.zIndex='';
  taskEl.classList.remove('dragging-ghost');
  suppressNextClick = true;
  setTimeout(()=>{ suppressNextClick=false; }, 50);

  const idsInOrder = Array.from(groupEl.querySelectorAll('.task')).map(el=>el.dataset.dragId);
  idsInOrder.forEach((id, idx)=>{
    const t = state.tasks.find(x=>x.id===id);
    if(t) t.order = idx;
  });
  await saveTasks();
  dragState = null;
}

async function toggleDone(taskId, dKey){
  const t = state.tasks.find(x=>x.id===taskId);
  if(!t) return;
  if(t.log[dKey]){
    delete t.log[dKey];
    await saveTasks(); render();
  } else {
    t.log[dKey] = {note:''};
    await saveTasks(); render();
    openNoteSheet(taskId, dKey);
  }
}

function escapeHtml(s){
  const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML;
}

/* ---------- Calendar view ---------- */
let calMonth = new Date(); calMonth.setDate(1);

function renderCalendar(){
  const root = document.getElementById('viewRoot');
  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  const firstDow = (new Date(year,month,1).getDay()+6)%7;
  const daysInMonth = new Date(year,month+1,0).getDate();
  const prevDays = new Date(year,month,0).getDate();
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push({n:prevDays-firstDow+1+i, other:true});
  for(let d=1; d<=daysInMonth; d++) cells.push({n:d, other:false, date:new Date(year,month,d)});
  while(cells.length % 7 !== 0) cells.push({n:cells.length, other:true});

  const monthName = calMonth.toLocaleDateString('ru-RU',{month:'long', year:'numeric'});
  const todayStr = todayKey();

  root.innerHTML = `
    <div class="cal-header">
      <button id="prevMonth">‹</button>
      <h3>${monthName[0].toUpperCase()+monthName.slice(1)}</h3>
      <button id="nextMonth">›</button>
    </div>
    <div class="cal-grid">
      ${DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
      ${cells.map(c=>{
        if(c.other) return `<div class="cal-cell other">${c.n}</div>`;
        const key = formatDateKey(c.date);
        const scheduled = tasksForDate(key);
        const doneN = scheduled.filter(t=>t.log[key]).length;
        const pct = scheduled.length ? Math.round(doneN/scheduled.length*100) : 0;
        const isToday = key===todayStr;
        return `<div class="cal-cell ${isToday?'today':''}" data-datekey="${key}">
          ${c.n}
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>`;
      }).join('')}
    </div>
    <div id="calDetail"></div>
  `;
  document.getElementById('prevMonth').onclick = ()=>{ calMonth.setMonth(calMonth.getMonth()-1); renderCalendar(); };
  document.getElementById('nextMonth').onclick = ()=>{ calMonth.setMonth(calMonth.getMonth()+1); renderCalendar(); };
  root.querySelectorAll('.cal-cell[data-datekey]').forEach(el=>{
    el.onclick = ()=>{
      state.selectedCalDate = el.dataset.datekey;
      renderCalDetail(el.dataset.datekey);
    };
  });
}

function renderCalDetail(dateKey){
  const root = document.getElementById('calDetail');
  const dayIdx = (parseDateKey(dateKey).getDay()+6)%7;
  const scheduled = tasksForDate(dateKey);
  const d = parseDateKey(dateKey);
  root.innerHTML = `
    <div class="cal-detail">
      <h4>${d.toLocaleDateString('ru-RU',{day:'numeric', month:'long'})} · ${DOW_FULL[dayIdx]}</h4>
      ${scheduled.length ? scheduled.map(t=>{
        const cat = catById(t.categoryId);
        const done = !!t.log[dateKey];
        const note = done && t.log[dateKey].note;
        return `<div class="task ${done?'done':''}" style="--cat-color:${cat.color}">
          <div class="check ${done?'checked':''}" data-taskid="${t.id}" data-datekey="${dateKey}">
            <svg viewBox="0 0 24 24"><polyline points="4 12 9 18 20 6"/></svg>
          </div>
          <div class="task-body">
            <div class="task-title">${escapeHtml(t.title)}</div>
            <div class="task-meta"><span class="task-cat">${escapeHtml(cat.name)}</span></div>
            ${note ? `<div class="task-note">${escapeHtml(note)}</div>` : ''}
          </div>
        </div>`;
      }).join('') : `<p style="font-size:13px; color:var(--ink-soft); margin:0;">На этот день ничего не запланировано</p>`}
    </div>
  `;
  root.querySelectorAll('.check').forEach(el=>{
    el.onclick = async ()=>{
      const t = state.tasks.find(x=>x.id===el.dataset.taskid);
      const key = el.dataset.datekey;
      if(t.log[key]){ delete t.log[key]; await saveTasks(); renderCalDetail(key); renderCalendar(); }
      else{ t.log[key] = {note:''}; await saveTasks(); renderCalDetail(key); renderCalendar(); openNoteSheet(t.id, key, ()=>renderCalDetail(key)); }
    };
  });
}
/* ---------- Sheets (modals) ---------- */
function openOverlay(html){
  document.getElementById('sheet').innerHTML = html;
  document.getElementById('overlay').classList.add('open');
}
function closeOverlay(){ document.getElementById('overlay').classList.remove('open'); }
document.getElementById('overlay').addEventListener('click', e=>{
  if(e.target.id === 'overlay') closeOverlay();
});

function openTaskSheet(taskId, contextDateKey){
  const editing = !!taskId;
  const defaultDateKey = contextDateKey || dateKeyForDayIndex(state.activeDay);
  const task = editing ? state.tasks.find(t=>t.id===taskId) : {
    title:'', categoryId: state.categories[0]?.id,
    recurring: true, days:[state.activeDay], dates:[defaultDateKey]
  };
  const isRecurringInit = task.recurring !== false;

  openOverlay(`
    <h3>${editing?'Изменить дело':'Новое дело'}</h3>
    <div class="field">
      <label>Название</label>
      <input type="text" id="f-title" placeholder="Например: Английский" value="${escapeHtml(task.title)}">
    </div>
    <div class="field">
      <label>Категория</label>
      <div class="chiprow" id="catChips">
        ${state.categories.map(c=>`
          <div class="chip ${task.categoryId===c.id?'selected':''}" style="--chip-color:${c.color}" data-catid="${c.id}">
            <span class="dot"></span>${escapeHtml(c.name)}
          </div>`).join('')}
        <div class="chip" id="addCatChip">+ своя</div>
      </div>
      <div id="newCatBox" style="display:none;">
        <div class="newcat-row">
          <input type="text" id="newCatName" placeholder="Название категории">
        </div>
        <div class="swatches" id="newCatSwatches">
          ${SWATCHES.map((s,i)=>`<div class="swatch ${i===0?'selected':''}" style="background:${s}" data-color="${s}"></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="field">
      <label>Тип</label>
      <div class="chiprow">
        <div class="chip mode-chip ${isRecurringInit?'selected':''}" id="modeRecurring" style="--chip-color:#20232B">Каждую неделю</div>
        <div class="chip mode-chip ${!isRecurringInit?'selected':''}" id="modeOnce" style="--chip-color:#20232B">Разовое, на дату</div>
      </div>
    </div>
    <div class="field" id="recurringField" style="display:${isRecurringInit?'block':'none'}">
      <label>Дни недели</label>
      <div class="daypick" id="dayPick">
        ${DOW.map((d,i)=>`<button data-day="${i}" class="${(task.days||[]).includes(i)?'selected':''}">${d}</button>`).join('')}
      </div>
      <button class="btn btn-ghost" id="allDaysBtn" style="width:100%; margin-top:8px; font-size:13px; padding:9px;">Каждый день</button>
    </div>
    <div class="field" id="onceField" style="display:${isRecurringInit?'none':'block'}">
      <label>Дата</label>
      <input type="date" id="f-date" value="${(task.dates && task.dates[0]) || defaultDateKey}">
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" id="cancelBtn">Отмена</button>
      <button class="btn btn-primary" id="saveBtn">${editing?'Сохранить':'Добавить'}</button>
    </div>
    ${editing?`<button class="btn btn-danger" id="deleteBtn" style="width:100%; margin-top:12px;">Удалить дело</button>`:''}
  `);

  let selectedCat = task.categoryId;
  let selectedDays = new Set(task.days||[]);
  let newCatColor = SWATCHES[0];
  let recurringMode = isRecurringInit;

  document.getElementById('catChips').querySelectorAll('.chip[data-catid]').forEach(el=>{
    el.onclick = ()=>{
      selectedCat = el.dataset.catid;
      document.getElementById('catChips').querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('newCatBox').style.display='none';
    };
  });
  document.getElementById('addCatChip').onclick = ()=>{
    document.getElementById('newCatBox').style.display='block';
    document.getElementById('catChips').querySelectorAll('.chip[data-catid]').forEach(c=>c.classList.remove('selected'));
    selectedCat = null;
  };
  document.getElementById('newCatSwatches').querySelectorAll('.swatch').forEach(el=>{
    el.onclick = ()=>{
      newCatColor = el.dataset.color;
      document.getElementById('newCatSwatches').querySelectorAll('.swatch').forEach(s=>s.classList.remove('selected'));
      el.classList.add('selected');
    };
  });
  document.getElementById('dayPick').querySelectorAll('button').forEach(el=>{
    el.onclick = ()=>{
      const day = parseInt(el.dataset.day);
      if(selectedDays.has(day)){ selectedDays.delete(day); el.classList.remove('selected'); }
      else{ selectedDays.add(day); el.classList.add('selected'); }
    };
  });
  document.getElementById('allDaysBtn').onclick = ()=>{
    const allSelected = selectedDays.size === 7;
    const dayPickEl = document.getElementById('dayPick');
    if(allSelected){
      selectedDays.clear();
      dayPickEl.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
    } else {
      for(let i=0;i<7;i++) selectedDays.add(i);
      dayPickEl.querySelectorAll('button').forEach(b=>b.classList.add('selected'));
    }
  };
  document.getElementById('modeRecurring').onclick = ()=>{
    recurringMode = true;
    document.getElementById('modeRecurring').classList.add('selected');
    document.getElementById('modeOnce').classList.remove('selected');
    document.getElementById('recurringField').style.display='block';
    document.getElementById('onceField').style.display='none';
  };
  document.getElementById('modeOnce').onclick = ()=>{
    recurringMode = false;
    document.getElementById('modeOnce').classList.add('selected');
    document.getElementById('modeRecurring').classList.remove('selected');
    document.getElementById('recurringField').style.display='none';
    document.getElementById('onceField').style.display='block';
  };
  document.getElementById('cancelBtn').onclick = closeOverlay;
  if(editing){
    document.getElementById('deleteBtn').onclick = async ()=>{
      state.tasks = state.tasks.filter(t=>t.id!==taskId);
      await saveTasks(); closeOverlay(); render();
    };
  }
  document.getElementById('saveBtn').onclick = async ()=>{
    const title = document.getElementById('f-title').value.trim();
    if(!title) return;
    const newCatName = document.getElementById('newCatName')?.value.trim();
    let catId = selectedCat;
    if(!catId && newCatName){
      const newCat = {id:uid(), name:newCatName, color:newCatColor};
      state.categories.push(newCat);
      await saveCategories();
      catId = newCat.id;
    }
    if(!catId) catId = state.categories[0]?.id;

    let days = [], dates = [];
    if(recurringMode){
      days = Array.from(selectedDays);
      if(!days.length) days.push(state.activeDay);
    } else {
      const dateVal = document.getElementById('f-date').value;
      dates = [dateVal || defaultDateKey];
    }

    if(editing){
      task.title = title; task.categoryId = catId;
      task.recurring = recurringMode; task.days = days; task.dates = dates;
    } else {
      const groupTasks = state.tasks.filter(x=>x.recurring===recurringMode);
      const maxOrder = groupTasks.reduce((m,x)=>Math.max(m, x.order||0), -1);
      state.tasks.push({id:uid(), title, categoryId:catId, recurring:recurringMode, days, dates, log:{}, order:maxOrder+1});
    }
    await saveTasks();
    closeOverlay(); render();
  };
}

function openNoteSheet(taskId, dateKey, onSaved){
  const t = state.tasks.find(x=>x.id===taskId);
  const entry = t.log[dateKey] || {note:''};
  openOverlay(`
    <h3>Как прошло?</h3>
    <div class="field">
      <label>${escapeHtml(t.title)} · заметка (необязательно)</label>
      <textarea id="noteText" placeholder="Например: получилось 40 минут, было тяжело собраться...">${escapeHtml(entry.note)}</textarea>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" id="skipBtn">Пропустить</button>
      <button class="btn btn-primary" id="saveNoteBtn">Сохранить</button>
    </div>
  `);
  document.getElementById('skipBtn').onclick = closeOverlay;
  document.getElementById('saveNoteBtn').onclick = async ()=>{
    t.log[dateKey] = {note: document.getElementById('noteText').value.trim()};
    await saveTasks(); closeOverlay(); render(); if(onSaved) onSaved();
  };
}

document.getElementById('fabBtn').onclick = ()=>{
  let ctx = null;
  if(state.view === 'week'){
    ctx = dateKeyForDayIndex(state.activeDay);
  } else if(state.view === 'calendar' && state.selectedCalDate){
    ctx = state.selectedCalDate;
  }
  openTaskSheet(null, ctx);
};

/* ---------- Backup: export / import ---------- */
function openBackupSheet(){
  openOverlay(`
    <h3>Резервная копия</h3>
    <p style="font-size:13px; color:var(--ink-soft); margin:0 0 16px; line-height:1.5;">
      Экспорт сохраняет все твои дела, категории и отметки в один файл на компьютер/телефон.
      Импорт загружает их обратно — например, после обновления кода или на новом устройстве.
    </p>
    <div class="backup-row">
      <button class="btn btn-primary" id="exportBtn">Экспортировать</button>
      <button class="btn btn-ghost" id="importBtn">Импортировать</button>
    </div>
    <button class="btn btn-ghost" id="closeBackupBtn" style="width:100%; margin-top:10px;">Закрыть</button>
  `);
  document.getElementById('exportBtn').onclick = exportData;
  document.getElementById('importBtn').onclick = ()=>document.getElementById('importInput').click();
  document.getElementById('closeBackupBtn').onclick = closeOverlay;
}

function exportData(){
  const payload = { categories: state.categories, tasks: state.tasks, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `moy-plan-backup-${dateStr}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  closeOverlay();
}

document.getElementById('importInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    if(!Array.isArray(data.categories) || !Array.isArray(data.tasks)){
      alert('Файл не похож на резервную копию этого приложения.');
      return;
    }
    state.categories = data.categories;
    state.tasks = data.tasks;
    await saveCategories();
    await saveTasks();
    closeOverlay();
    render();
  }catch(err){
    alert('Не получилось прочитать файл. Проверь, что это тот самый .json от экспорта.');
  }
  e.target.value = '';
});

/* ---------- App lock ---------- */
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function getLockHash(){ return localStorage.getItem('planner_lock_hash'); }
async function setLockPin(pin){ localStorage.setItem('planner_lock_hash', await sha256(pin)); }
function removeLockPin(){ localStorage.removeItem('planner_lock_hash'); }

let enteredPin = '';
function showLockScreen(){
  document.getElementById('lockScreen').style.display='flex';
  enteredPin = ''; renderLockDots();
  document.getElementById('lockError').textContent='';
  renderLockKeypad();
}
function hideLockScreen(){ document.getElementById('lockScreen').style.display='none'; }
function renderLockDots(){
  document.getElementById('lockDots').innerHTML = Array.from({length:4}).map((_,i)=>
    `<span class="lock-dot ${i<enteredPin.length?'filled':''}"></span>`).join('');
}
function renderLockKeypad(){
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const el = document.getElementById('lockKeypad');
  el.innerHTML = keys.map(k=>k?`<button data-key="${k}" class="lock-key">${k}</button>`:'<span></span>').join('');
  el.querySelectorAll('.lock-key').forEach(b=>{ b.onclick = ()=>onLockKey(b.dataset.key); });
}
async function onLockKey(key){
  if(key==='⌫'){ enteredPin = enteredPin.slice(0,-1); renderLockDots(); return; }
  if(enteredPin.length>=4) return;
  enteredPin += key; renderLockDots();
  if(enteredPin.length===4){
    if(await sha256(enteredPin) === getLockHash()){ hideLockScreen(); }
    else{
      document.getElementById('lockError').textContent = 'Неверный пароль';
      setTimeout(()=>{ enteredPin=''; renderLockDots(); }, 400);
    }
  }
}
function openLockSettingsSheet(){
  const has = !!getLockHash();
  openOverlay(`
    <h3>Пароль на вход</h3>
    <p style="font-size:13px; color:var(--ink-soft); margin:0 0 16px; line-height:1.5;">
      ${has ? 'Пароль уже установлен. Можешь изменить его или убрать.' : 'Установи 4-значный пароль, который будет запрашиваться при открытии приложения.'}
    </p>
    <div class="field">
      <label>${has?'Новый пароль':'Пароль'} (4 цифры)</label>
      <input type="password" inputmode="numeric" maxlength="4" id="newPin" placeholder="••••">
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" id="cancelLockBtn">Отмена</button>
      <button class="btn btn-primary" id="saveLockBtn">Сохранить</button>
    </div>
    ${has?`<button class="btn btn-danger" id="removeLockBtn" style="width:100%; margin-top:12px;">Убрать пароль</button>`:''}
  `);
  document.getElementById('cancelLockBtn').onclick = closeOverlay;
  document.getElementById('saveLockBtn').onclick = async ()=>{
    const val = document.getElementById('newPin').value.trim();
    if(!/^\d{4}$/.test(val)){ alert('Введи ровно 4 цифры.'); return; }
    await setLockPin(val); closeOverlay();
  };
  if(has){ document.getElementById('removeLockBtn').onclick = ()=>{ removeLockPin(); closeOverlay(); }; }
}

if(getLockHash()) showLockScreen();

loadState();