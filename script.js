/* ═══════════════════════════════════════════════════════
   TaskFlow — script.js
   Includes: Daily Tasks, Monthly Goals, Annual Goals,
             Calendar View, TWO-WAY Google Calendar Sync
   ═══════════════════════════════════════════════════════ */

// ─── Google Calendar API config ───────────────────────
var GCAL_CLIENT_ID = (typeof TASKFLOW_CONFIG !== 'undefined') ? TASKFLOW_CONFIG.GCAL_CLIENT_ID : '';
var GCAL_API_KEY   = (typeof TASKFLOW_CONFIG !== 'undefined') ? TASKFLOW_CONFIG.GCAL_API_KEY   : '';
var GCAL_SCOPES    = (typeof TASKFLOW_CONFIG !== 'undefined') ? TASKFLOW_CONFIG.GCAL_SCOPES    : 'https://www.googleapis.com/auth/calendar';

var gcalConnected = false;
var gcalEvents    = {};
var tokenClient;

var days   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

var taskList           = document.querySelector(".task-list");
var taskCountElement   = document.getElementById("taskCount");
var progressBar        = document.querySelector(".progress-bar");
var prevButton         = document.querySelector(".prev-button");
var nextButton         = document.querySelector(".next-button");
var todayButton        = document.querySelector(".today-button");
var currentDayElement  = document.querySelector(".current-day");
var currentDateElement = document.querySelector(".current-date");
var currentDate        = new Date();
currentDate.setHours(0,0,0,0);

var currentMonthIndex = new Date().getMonth();
var currentMonthYear  = new Date().getFullYear();
var currentAnnualYear = new Date().getFullYear();

var calViewYear     = new Date().getFullYear();
var calViewMonth    = new Date().getMonth();
var calSelectedDate = new Date();
calSelectedDate.setHours(0,0,0,0);

// ═════ TAB SWITCHING ═════════════════════════════════
var tabBtns   = document.querySelectorAll(".tab-btn");
var tabPanels = document.querySelectorAll(".tab-panel");
tabBtns.forEach(function(btn) {
  btn.addEventListener("click", function() {
    tabBtns.forEach(function(b)  { b.classList.remove("active"); });
    tabPanels.forEach(function(p){ p.classList.remove("active"); });
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "calendar") renderCalendar();
  });
});

// ═════ HELPERS ═══════════════════════════════════════
function getDateKey(date) { return date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate(); }
function getMonthKey()    { return "monthly_" + currentMonthYear + "_" + currentMonthIndex; }
function getAnnualKey()   { return "annual_"  + currentAnnualYear; }
function isToday(date)    { var t = new Date(); t.setHours(0,0,0,0); return date.getTime()===t.getTime(); }
function isSameDay(a,b)   { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function formatDisplayDate(d) { return months[d.getMonth()]+" "+d.getDate()+", "+d.getFullYear(); }
function formatLongDate(d)    { return days[d.getDay()]+", "+months[d.getMonth()]+" "+d.getDate(); }
function dateToISO(date) {
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}

// ═════ GOOGLE CALENDAR — TWO-WAY SYNC ════════════════

// Create an all-day event in Google Calendar. Returns Promise<eventId|null>
function gcalCreateTask(text, date) {
  if (!gcalConnected) return Promise.resolve(null);
  var ds = dateToISO(date);
  return gapi.client.calendar.events.insert({
    calendarId: 'primary',
    resource: {
      summary:     "✅ " + text,
      description: "TaskFlow task",
      start: { date: ds },
      end:   { date: ds },
      colorId: "2"
    }
  }).then(function(r){ return r.result.id; })
    .catch(function(e){ console.error("GCal create:", e); return null; });
}

// Update event title/color when task is checked/unchecked
function gcalCompleteTask(eventId, text, completed) {
  if (!gcalConnected || !eventId) return;
  gapi.client.calendar.events.patch({
    calendarId: 'primary', eventId: eventId,
    resource: { summary: (completed ? "☑ " : "✅ ") + text, colorId: completed ? "8" : "2" }
  }).catch(function(e){ console.error("GCal patch:", e); });
}

// Delete the GCal event when a task is removed
function gcalDeleteTask(eventId) {
  if (!gcalConnected || !eventId) return;
  gapi.client.calendar.events.delete({ calendarId: 'primary', eventId: eventId })
    .catch(function(e){ console.error("GCal delete:", e); });
}

// ═════ TASK CREATION ══════════════════════════════════
function createTaskItem(text, completed, gcalEventId, saveFunc, list, counterId, progressId) {
  var li = document.createElement("li");
  li.className = "task-item";
  li.dataset.gcalId = gcalEventId || "";

  var cb = document.createElement("input");
  cb.type = "checkbox"; cb.className = "task-checkbox"; cb.checked = completed;

  var label = document.createElement("label");
  label.className = "task-label"; label.innerText = text;

  var del = document.createElement("button");
  del.innerText = "×"; del.className = "delete-btn";
  del.addEventListener("click", function() {
    if (li.dataset.gcalId) gcalDeleteTask(li.dataset.gcalId);
    li.remove(); saveFunc();
    if (counterId) updateGoalCounter(list, counterId, progressId); else updateCounter();
    if (list === taskList) renderCalendar();
  });

  cb.addEventListener("change", function() {
    if (li.dataset.gcalId) gcalCompleteTask(li.dataset.gcalId, text, cb.checked);
    saveFunc();
    if (counterId) updateGoalCounter(list, counterId, progressId); else updateCounter();
  });

  li.appendChild(cb); li.appendChild(label); li.appendChild(del);
  return li;
}

// ═════ COUNTERS ═══════════════════════════════════════
function updateCounter() {
  var total = taskList.querySelectorAll(".task-item").length;
  var done  = taskList.querySelectorAll(".task-checkbox:checked").length;
  taskCountElement.innerText = "You have "+total+" task"+(total!==1?"s":"");
  if (done>0) taskCountElement.innerText += " ("+done+" done)";
  progressBar.max=total; progressBar.value=done;
}
function updateGoalCounter(list, counterId, progressId) {
  var total=list.querySelectorAll(".task-item").length;
  var done =list.querySelectorAll(".task-checkbox:checked").length;
  var lbl  =list.id==="monthlyGoalList"?"monthly goal":"annual goal";
  document.getElementById(counterId).innerText="You have "+total+" "+lbl+(total!==1?"s":"")+(done>0?" ("+done+" done)":"");
  document.getElementById(progressId).max=total; document.getElementById(progressId).value=done;
}

// ═════ SAVE / LOAD — DAILY TASKS ══════════════════════
function saveTasks() {
  var data=[];
  taskList.querySelectorAll(".task-item").forEach(function(item){
    data.push({ text:item.querySelector(".task-label").innerText, completed:item.querySelector(".task-checkbox").checked, gcalEventId:item.dataset.gcalId||"" });
  });
  localStorage.setItem("taskflow_"+getDateKey(currentDate), JSON.stringify(data));
}
function loadTasksForDate() {
  taskList.innerHTML="";
  var saved=localStorage.getItem("taskflow_"+getDateKey(currentDate));
  if (saved) JSON.parse(saved).forEach(function(t){
    taskList.appendChild(createTaskItem(t.text,t.completed,t.gcalEventId||"",saveTasks,taskList,null,null));
  });
  updateCounter();
}

// ═════ SAVE / LOAD — GOALS ════════════════════════════
function saveMonthlyGoals() {
  var data=[];
  document.getElementById("monthlyGoalList").querySelectorAll(".task-item").forEach(function(i){ data.push({text:i.querySelector(".task-label").innerText,completed:i.querySelector(".task-checkbox").checked}); });
  localStorage.setItem(getMonthKey(),JSON.stringify(data));
}
function loadMonthlyGoals() {
  var list=document.getElementById("monthlyGoalList"); list.innerHTML="";
  var saved=localStorage.getItem(getMonthKey());
  if (saved) JSON.parse(saved).forEach(function(g){ list.appendChild(createTaskItem(g.text,g.completed,"",saveMonthlyGoals,list,"monthlyGoalCount","monthlyProgress")); });
  updateGoalCounter(list,"monthlyGoalCount","monthlyProgress");
}
function saveAnnualGoals() {
  var data=[];
  document.getElementById("annualGoalList").querySelectorAll(".task-item").forEach(function(i){ data.push({text:i.querySelector(".task-label").innerText,completed:i.querySelector(".task-checkbox").checked}); });
  localStorage.setItem(getAnnualKey(),JSON.stringify(data));
}
function loadAnnualGoals() {
  var list=document.getElementById("annualGoalList"); list.innerHTML="";
  var saved=localStorage.getItem(getAnnualKey());
  if (saved) JSON.parse(saved).forEach(function(g){ list.appendChild(createTaskItem(g.text,g.completed,"",saveAnnualGoals,list,"annualGoalCount","annualProgress")); });
  updateGoalCounter(list,"annualGoalCount","annualProgress");
}

// ═════ DATE NAV ═══════════════════════════════════════
function updateDateDisplay() { currentDayElement.innerText=days[currentDate.getDay()]; currentDateElement.innerText=formatDisplayDate(currentDate); loadTasksForDate(); }
function updateMonthLabel()   { document.getElementById("monthLabel").innerText=months[currentMonthIndex]+" "+currentMonthYear; loadMonthlyGoals(); }
function updateYearLabel()    { document.getElementById("yearLabel").innerText=currentAnnualYear; loadAnnualGoals(); }

prevButton.addEventListener("click",function(e){ e.preventDefault(); currentDate.setDate(currentDate.getDate()-1); updateDateDisplay(); });
nextButton.addEventListener("click",function(e){ e.preventDefault(); currentDate.setDate(currentDate.getDate()+1); updateDateDisplay(); });
todayButton.addEventListener("click",function(e){ e.preventDefault(); currentDate=new Date(); currentDate.setHours(0,0,0,0); updateDateDisplay(); });
document.getElementById("prevMonth").addEventListener("click",function(){ currentMonthIndex--; if(currentMonthIndex<0){currentMonthIndex=11;currentMonthYear--;} updateMonthLabel(); });
document.getElementById("nextMonth").addEventListener("click",function(){ currentMonthIndex++; if(currentMonthIndex>11){currentMonthIndex=0;currentMonthYear++;} updateMonthLabel(); });
document.getElementById("prevYear").addEventListener("click",function(){ currentAnnualYear--; updateYearLabel(); });
document.getElementById("nextYear").addEventListener("click",function(){ currentAnnualYear++; updateYearLabel(); });

// ═════ INLINE EDITING ════════════════════════════════
taskList.addEventListener("dblclick",function(e){ if(e.target.className==="task-label"){ var t=prompt("Edit task:",e.target.innerText); if(t&&t.trim()){e.target.innerText=t.trim();saveTasks();} } });
document.getElementById("monthlyGoalList").addEventListener("dblclick",function(e){ if(e.target.className==="task-label"){ var t=prompt("Edit goal:",e.target.innerText); if(t&&t.trim()){e.target.innerText=t.trim();saveMonthlyGoals();} } });
document.getElementById("annualGoalList").addEventListener("dblclick",function(e){ if(e.target.className==="task-label"){ var t=prompt("Edit goal:",e.target.innerText); if(t&&t.trim()){e.target.innerText=t.trim();saveAnnualGoals();} } });

// ═════ ADD BUTTONS ════════════════════════════════════

// Daily Tasks — syncs to GCal
var addTaskBtn = document.createElement("button");
addTaskBtn.innerText="Add Task"; addTaskBtn.className="add-btn";
taskList.parentElement.appendChild(addTaskBtn);
addTaskBtn.addEventListener("click", function() {
  var name=prompt("Enter task name:"); if(!name||!name.trim()) return;
  var li=createTaskItem(name.trim(),false,"",saveTasks,taskList,null,null);
  taskList.appendChild(li); saveTasks(); updateCounter();
  gcalCreateTask(name.trim(), currentDate).then(function(id){
    if(id){ li.dataset.gcalId=id; saveTasks(); }
    renderCalendar();
  });
});

// Monthly Goals — no GCal sync
var addMonthlyBtn=document.createElement("button"); addMonthlyBtn.innerText="Add Monthly Goal"; addMonthlyBtn.className="add-btn";
document.getElementById("monthlyGoalList").parentElement.appendChild(addMonthlyBtn);
addMonthlyBtn.addEventListener("click",function(){ var n=prompt("Enter monthly goal:"); if(!n||!n.trim()) return; var list=document.getElementById("monthlyGoalList"); list.appendChild(createTaskItem(n.trim(),false,"",saveMonthlyGoals,list,"monthlyGoalCount","monthlyProgress")); saveMonthlyGoals(); updateGoalCounter(list,"monthlyGoalCount","monthlyProgress"); });

// Annual Goals — no GCal sync
var addAnnualBtn=document.createElement("button"); addAnnualBtn.innerText="Add Annual Goal"; addAnnualBtn.className="add-btn";
document.getElementById("annualGoalList").parentElement.appendChild(addAnnualBtn);
addAnnualBtn.addEventListener("click",function(){ var n=prompt("Enter annual goal:"); if(!n||!n.trim()) return; var list=document.getElementById("annualGoalList"); list.appendChild(createTaskItem(n.trim(),false,"",saveAnnualGoals,list,"annualGoalCount","annualProgress")); saveAnnualGoals(); updateGoalCounter(list,"annualGoalCount","annualProgress"); });

// Calendar Add Task — syncs to the selected date
document.getElementById("calDayAddBtn").addEventListener("click", function() {
  var name=prompt("Add task for "+formatLongDate(calSelectedDate)+":"); if(!name||!name.trim()) return;
  var targetDate=new Date(calSelectedDate);
  var key=getDateKey(targetDate);
  var arr=JSON.parse(localStorage.getItem("taskflow_"+key)||"[]");
  var idx=arr.length;
  arr.push({text:name.trim(),completed:false,gcalEventId:""});
  localStorage.setItem("taskflow_"+key,JSON.stringify(arr));
  if(isSameDay(targetDate,currentDate)) loadTasksForDate();
  gcalCreateTask(name.trim(),targetDate).then(function(id){
    if(id){ var a=JSON.parse(localStorage.getItem("taskflow_"+key)||"[]"); if(a[idx]!==undefined){a[idx].gcalEventId=id;} localStorage.setItem("taskflow_"+key,JSON.stringify(a)); if(isSameDay(targetDate,currentDate)) loadTasksForDate(); }
    renderCalendar(); renderDayPanel(calSelectedDate);
  });
  renderCalendar(); renderDayPanel(calSelectedDate);
});

// ═════ CALENDAR RENDERING ════════════════════════════
function getTasksForDate(date) { var s=localStorage.getItem("taskflow_"+getDateKey(date)); return s?JSON.parse(s):[]; }

function renderCalendar() {
  document.getElementById("calMonthLabel").innerText=months[calViewMonth]+" "+calViewYear;
  var grid=document.getElementById("calGrid"); grid.innerHTML="";
  var firstDay=new Date(calViewYear,calViewMonth,1).getDay();
  var daysInMonth=new Date(calViewYear,calViewMonth+1,0).getDate();
  var prevDays=new Date(calViewYear,calViewMonth,0).getDate();
  for(var i=firstDay-1;i>=0;i--) grid.appendChild(buildCell(new Date(calViewYear,calViewMonth-1,prevDays-i),true));
  for(var d=1;d<=daysInMonth;d++) grid.appendChild(buildCell(new Date(calViewYear,calViewMonth,d),false));
  var trailing=(firstDay+daysInMonth)%7; trailing=trailing===0?0:7-trailing;
  for(var t=1;t<=trailing;t++) grid.appendChild(buildCell(new Date(calViewYear,calViewMonth+1,t),true));
  renderDayPanel(calSelectedDate);
}

function buildCell(date, otherMonth) {
  var cell=document.createElement("div");
  cell.className="cal-cell"+(otherMonth?" other-month":"");
  if(isToday(date))                    cell.classList.add("today");
  if(isSameDay(date,calSelectedDate))  cell.classList.add("selected");
  var num=document.createElement("div"); num.className="cal-cell-num"; num.innerText=date.getDate(); cell.appendChild(num);
  var dots=document.createElement("div"); dots.className="cal-cell-dots";
  if(getTasksForDate(date).length>0){ var d=document.createElement("div"); d.className="cal-dot task"; dots.appendChild(d); }
  (gcalEvents[getDateKey(date)]||[]).filter(function(e){ return !e.description||e.description!=="TaskFlow task"; }).slice(0,3).forEach(function(e){ var d=document.createElement("div"); d.className="cal-dot "+getGcalDotColor(e); dots.appendChild(d); });
  cell.appendChild(dots);
  cell.addEventListener("click",function(){ calSelectedDate=new Date(date); calSelectedDate.setHours(0,0,0,0); renderCalendar(); });
  return cell;
}

function getGcalDotColor(e) { return {"2":"gcal-green","4":"gcal-red","5":"gcal-yellow","6":"gcal-orange","7":"gcal-blue"}[e.colorId||"1"]||"gcal"; }

function renderDayPanel(date) {
  document.getElementById("calDayTitle").innerText=formatLongDate(date);
  var container=document.getElementById("calDayEvents"); container.innerHTML="";
  var tasks=getTasksForDate(date);
  var evts=(gcalEvents[getDateKey(date)]||[]).filter(function(e){ return !e.description||e.description!=="TaskFlow task"; });

  if(tasks.length===0&&evts.length===0){
    container.innerHTML='<p class="cal-empty">No tasks or events. Click "+ Add Task" to get started.</p>'; return;
  }

  if(tasks.length>0){
    var tl=document.createElement("div"); tl.className="cal-section-label"; tl.innerText="Tasks"; container.appendChild(tl);
    tasks.forEach(function(task,idx){
      var row=document.createElement("div"); row.className="cal-event-item type-task";
      var cb=document.createElement("input"); cb.type="checkbox"; cb.className="cal-event-check"; cb.checked=task.completed;
      var nameEl=document.createElement("span"); nameEl.className="cal-event-name"; nameEl.innerText=task.text;
      if(task.completed){nameEl.style.textDecoration="line-through";nameEl.style.opacity="0.5";}
      var badge=document.createElement("span"); badge.style.fontSize="12px"; badge.title=task.gcalEventId?"Synced to Google Calendar":"Local only"; badge.innerText=task.gcalEventId?"📅":"";
      cb.addEventListener("change",function(){
        var key=getDateKey(date); var arr=JSON.parse(localStorage.getItem("taskflow_"+key)||"[]");
        if(arr[idx]){arr[idx].completed=cb.checked; if(arr[idx].gcalEventId) gcalCompleteTask(arr[idx].gcalEventId,task.text,cb.checked);}
        localStorage.setItem("taskflow_"+key,JSON.stringify(arr));
        if(isSameDay(date,currentDate)) loadTasksForDate();
        nameEl.style.textDecoration=cb.checked?"line-through":""; nameEl.style.opacity=cb.checked?"0.5":"1";
      });
      var icon=document.createElement("span"); icon.className="cal-event-icon"; icon.innerText="✅";
      row.appendChild(cb); row.appendChild(icon); row.appendChild(nameEl); row.appendChild(badge); container.appendChild(row);
    });
  }

  if(evts.length>0){
    var gl=document.createElement("div"); gl.className="cal-section-label"; gl.innerText="Google Calendar"; container.appendChild(gl);
    evts.forEach(function(evt){
      var row=document.createElement("div"); row.className="cal-event-item type-gcal";
      var icon=document.createElement("span"); icon.className="cal-event-icon"; icon.innerText="📅";
      var name=document.createElement("span"); name.className="cal-event-name"; name.innerText=evt.summary||"Untitled";
      var time=document.createElement("span"); time.className="cal-event-time";
      time.innerText=evt.start&&evt.start.dateTime?new Date(evt.start.dateTime).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"All day";
      row.appendChild(icon); row.appendChild(name); row.appendChild(time); container.appendChild(row);
    });
  }
}

document.getElementById("calPrev").addEventListener("click",function(){ calViewMonth--; if(calViewMonth<0){calViewMonth=11;calViewYear--;} renderCalendar(); });
document.getElementById("calNext").addEventListener("click",function(){ calViewMonth++; if(calViewMonth>11){calViewMonth=0;calViewYear++;} renderCalendar(); });
document.getElementById("calTodayBtn").addEventListener("click",function(){ var n=new Date(); calViewYear=n.getFullYear(); calViewMonth=n.getMonth(); calSelectedDate=new Date(); calSelectedDate.setHours(0,0,0,0); renderCalendar(); });

// ═════ GOOGLE AUTH ════════════════════════════════════
function initGoogleAPI() {
  if(!GCAL_CLIENT_ID||GCAL_CLIENT_ID==='YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') return;
  gapi.load('client',function(){
    gapi.client.init({ apiKey:GCAL_API_KEY, discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"] }).then(function(){
      tokenClient=google.accounts.oauth2.initTokenClient({ client_id:GCAL_CLIENT_ID, scope:GCAL_SCOPES,
        callback:function(r){ if(r.error) return; gcalConnected=true; localStorage.setItem("taskflow_gcal_connected","true"); updateGcalUI(); fetchGcalEvents(); }
      });
      if(localStorage.getItem("taskflow_gcal_connected")==="true") tokenClient.requestAccessToken({prompt:''});
    });
  });
}

function connectGCal() {
  if(!GCAL_CLIENT_ID||GCAL_CLIENT_ID==='YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'){ alert("Fill in credentials in config.js — see README."); return; }
  tokenClient.requestAccessToken({prompt:'consent'});
}
function disconnectGCal() {
  var t=gapi.client.getToken(); if(t) google.accounts.oauth2.revoke(t.access_token,function(){});
  gapi.client.setToken(''); gcalConnected=false; gcalEvents={}; localStorage.removeItem("taskflow_gcal_connected"); updateGcalUI(); renderCalendar();
}
function updateGcalUI() {
  var cb=document.getElementById("gcalConnectBtn"), db=document.getElementById("gcalDisconnectBtn"), sub=document.querySelector(".gcal-banner-sub");
  if(gcalConnected){ cb.style.display="none"; db.style.display="inline-block"; sub.innerHTML='<span class="gcal-status-dot"></span>Connected · tasks sync automatically'; }
  else { cb.style.display="inline-block"; db.style.display="none"; sub.innerText="See your events alongside your tasks"; }
}
function fetchGcalEvents() {
  var now=new Date(), from=new Date(now.getFullYear(),now.getMonth()-1,1), to=new Date(now.getFullYear(),now.getMonth()+3,1);
  document.getElementById("calDayEvents").innerHTML='<div class="gcal-loading"><div class="spinner"></div>Loading calendar events…</div>';
  gapi.client.calendar.events.list({ calendarId:'primary', timeMin:from.toISOString(), timeMax:to.toISOString(), maxResults:500, singleEvents:true, orderBy:'startTime' })
    .then(function(resp){
      gcalEvents={};
      (resp.result.items||[]).forEach(function(evt){ var d=new Date(evt.start.dateTime||evt.start.date); var k=d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate(); if(!gcalEvents[k]) gcalEvents[k]=[]; gcalEvents[k].push(evt); });
      renderCalendar();
    }).catch(function(e){ console.error("GCal fetch:",e); renderDayPanel(calSelectedDate); });
}

document.getElementById("gcalConnectBtn").addEventListener("click",connectGCal);
document.getElementById("gcalDisconnectBtn").addEventListener("click",disconnectGCal);

// ═════ INIT ═══════════════════════════════════════════
updateDateDisplay();
updateMonthLabel();
updateYearLabel();
window.addEventListener("load", function(){ initGoogleAPI(); });
