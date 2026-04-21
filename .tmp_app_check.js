// Replace these placeholders with your Firebase project's web app config.
const FIREBASE_CONFIG=window.CHITVAULT_FIREBASE_CONFIG||{
  apiKey:'AIzaSyABFcHyZXi0kLY7MNVGZByiyMtkgqNhHkU',
  authDomain:'easechit.firebaseapp.com',
  projectId:'easechit',
  storageBucket:'easechit.firebasestorage.app',
  messagingSenderId:'1094688786658',
  appId:'1:1094688786658:web:e24a829c4cf85af26176bb'
};
const ADMIN_PORTAL_CONFIG=window.CHITVAULT_ADMIN_PORTAL||{
  username:'admin',
  password:'Admin@123',
  foremanPlanLabel:'Paid Access',
  memberPlanLabel:'Free Access'
};
const DEFAULT_AVATAR={foreman:'F',member:'M'};
let auth=null,db=null,googleProvider=null,currentUser=null,authReady=false,isApplyingRemoteState=false;
let remoteUnsubscribe=null,saveTimer=null,lastSavedHash='',seededDemo=false;
let adminSessionActive=false;
let accessRegistry={foremen:[],updatedAt:null};
let memberAssignments=[];
let memberAssignmentsUnsubscribe=null;
let accessRegistryUnsubscribe=null;
let memberAssignmentBackfillDone=false;
let sharedPayments=[];
let sharedPaymentsUnsubscribe=null;
let sharedPaymentKeys=new Set();
let sharedLiveBids=[];
let sharedLiveBidsUnsubscribe=null;
let sharedAuctionSession=null;
let sharedAuctionSessionUnsubscribe=null;
const S={role:'foreman',theme:'dark',chits:[],members:[],payments:{},auctions:[],memberPayments:[],myChitFunds:[],liveBids:[],timerInterval:null,timerSecs:0,timerRunning:false,adCount:0,cur:'dashboard'};
const ACCESS_STORAGE_KEY='cv_admin_access_registry_v1';
const ADMIN_SESSION_KEY='cv_admin_portal_session_v1';
const fmt=v=>'â‚¹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
const fmtN=v=>Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
const pct=v=>v.toFixed(2)+'%';
function normalizeEmail(v){return String(v||'').trim().toLowerCase();}
function escJsSingle(v){return String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
function isValidEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function formatWhen(v){
  if(!v)return 'Not yet';
  const d=new Date(v);
  return Number.isNaN(d.getTime())?'Not yet':d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
}
function loadAccessRegistry(){
  try{
    const raw=localStorage.getItem(ACCESS_STORAGE_KEY);
    if(raw){
      const parsed=JSON.parse(raw);
      accessRegistry={
        foremen:Array.isArray(parsed&&parsed.foremen)?parsed.foremen.map(item=>({
          email:normalizeEmail(item.email),
          name:(item.name||'').trim(),
          plan:item.plan||'paid',
          grantedAt:item.grantedAt||new Date().toISOString()
        })).filter(item=>item.email):[],
        updatedAt:parsed&&parsed.updatedAt?parsed.updatedAt:null
      };
    }
  }catch(err){
    console.error(err);
    accessRegistry={foremen:[],updatedAt:null};
  }
  adminSessionActive=localStorage.getItem(ADMIN_SESSION_KEY)==='1';
}
function persistAccessRegistryLocal(){
  localStorage.setItem(ACCESS_STORAGE_KEY,JSON.stringify(accessRegistry));
}
function getForemanAccessCollection(){
  return db.collection('foremanAccess');
}
function subscribeAccessRegistry(){
  if(accessRegistryUnsubscribe){accessRegistryUnsubscribe();accessRegistryUnsubscribe=null;}
  if(!db||!currentUser){
    renderForemanAccessList();
    updateAuthUI(currentUser);
    return;
  }
  accessRegistryUnsubscribe=getForemanAccessCollection().onSnapshot(snap=>{
    accessRegistry={
      foremen:snap.docs.map(doc=>{
        const data=doc.data()||{};
        return {
          email:normalizeEmail(data.email||doc.id),
          name:(data.name||'').trim(),
          plan:data.plan||'paid',
          grantedAt:data.grantedAt&&data.grantedAt.toDate?data.grantedAt.toDate().toISOString():(data.grantedAt||new Date().toISOString())
        };
      }).filter(item=>item.email),
      updatedAt:new Date().toISOString()
    };
    persistAccessRegistryLocal();
    renderForemanAccessList();
    updateAuthUI(currentUser);
    if(currentUser&&userHasForemanAccess(currentUser)&&S.role!=='foreman'){
      setRole('foreman',false);
    }
  },err=>{
    console.error(err);
    renderForemanAccessList();
    updateAuthUI(currentUser);
  });
}
function saveAccessRegistry(){
  accessRegistry.updatedAt=new Date().toISOString();
  persistAccessRegistryLocal();
  renderForemanAccessList();
  updateAuthUI(currentUser);
  if(currentUser&&userHasForemanAccess(currentUser)){
    if(S.role!=='foreman') setRole('foreman',false);
    else updateRoleAccessUI();
  }else{
    updateAccessUI();
  }
}
function getForemanGrant(email){
  const key=normalizeEmail(email);
  return accessRegistry.foremen.find(item=>item.email===key)||null;
}
function userHasForemanAccess(user=currentUser){
  return !!(user&&user.email&&getForemanGrant(user.email));
}
function enforceForemanAccess(showToast){
  if(S.role!=='foreman'||!currentUser)return true;
  if(userHasForemanAccess(currentUser)) return true;
  S.role='member';
  if(showToast) toast('Foreman access requires administrator approval. Member access remains free.',true);
  return false;
}
function firebaseConfigured(){
  return FIREBASE_CONFIG&&FIREBASE_CONFIG.apiKey&&FIREBASE_CONFIG.apiKey!=='YOUR_API_KEY'&&FIREBASE_CONFIG.projectId&&FIREBASE_CONFIG.projectId!=='YOUR_PROJECT_ID'&&FIREBASE_CONFIG.appId&&FIREBASE_CONFIG.appId!=='YOUR_APP_ID';
}
function createDemoState(){
  const today=new Date();
  const ym=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const chits=[{id:1001,name:'Gold Chit 2025',value:100000,members:20,duration:20,comm:5,start:ym,created:today.toLocaleDateString('en-IN')}];
  const members=[
    {name:'Ravi Kumar',phone:'9876543210',email:''},
    {name:'Priya Lakshmi',phone:'9845123456',email:''},
    {name:'Suresh Babu',phone:'9812345678',email:''},
    {name:'Anitha Devi',phone:'9798765432',email:''},
    {name:'Murugan A.',phone:'9789012345',email:''}
  ].map((m,i)=>({id:2000+i,...m,groupId:1001,groupName:'Gold Chit 2025',ticket:i+1,color:CLR[i%CLR.length],prized:false}));
  return {role:S.role,theme:S.theme,chits,members,payments:{'2000_1001_1':true,'2001_1001_1':true,'2002_1001_1':true},auctions:[{id:3001,month:1,groupName:'Gold Chit 2025',winner:'Ravi Kumar',discount:4500,dividend:225,prize:90500,comm:5000}],memberPayments:[],myChitFunds:[],liveBids:[],adCount:0,cur:'dashboard'};
}
function createBlankState(){
  return {role:'member',theme:S.theme||'dark',chits:[],members:[],payments:{},auctions:[],memberPayments:[],myChitFunds:[],liveBids:[],adCount:0,cur:'m_dashboard'};
}
function serializableState(){
  return {role:S.role,theme:S.theme,chits:S.chits,members:S.members,payments:S.payments,auctions:S.auctions,memberPayments:S.memberPayments,myChitFunds:S.myChitFunds,liveBids:S.liveBids,adCount:S.adCount,cur:S.cur};
}
function stateHash(obj){return JSON.stringify(obj);}
function getMemberAssignmentRef(memberId,groupId){
  return db.collection('memberAssignments').doc(`${groupId}_${memberId}`);
}
function getCurrentUserEmail(){
  return normalizeEmail(currentUser&&currentUser.email?currentUser.email:'');
}
function getPaymentRecordRef(memberId,groupId,month){
  return db.collection('paymentRecords').doc(`${groupId}_${memberId}_${month}`);
}
function getLiveBidRef(groupId,bidderKey){
  return db.collection('liveBids').doc(`${groupId}_${bidderKey}`);
}
function getAuctionSessionRef(){
  return db.collection('auctionSessions').doc('current');
}
function getMatchedMembers(email=getCurrentUserEmail()){
  if(!email)return [];
  return S.members.filter(member=>normalizeEmail(member.email)===email);
}
function getAssignedMemberFunds(){
  return memberAssignments.map(item=>({
    key:`c_${item.groupId}`,
    source:'assigned',
    id:item.groupId,
    name:item.groupName,
    value:Number(item.value)||0,
    members:Number(item.members)||0,
    duration:Number(item.duration)||0,
    comm:Number(item.comm)||0,
    start:item.start||'',
    paid:Number(item.paidMonths)||0,
    memberName:item.memberName||'',
    memberEmail:item.memberEmail||'',
    memberTicket:item.memberTicket||'',
    foremanName:item.foremanName||'',
    notes:''
  })).filter(item=>item.id);
}
function getVisibleMemberFunds(){
  return [
    ...getAssignedMemberFunds(),
    ...S.myChitFunds.map(f=>({
      key:`m_${f.id}`,
      source:'personal',
      id:f.id,
      name:f.name,
      value:Number(f.value)||0,
      members:Number(f.members)||0,
      duration:Number(f.duration)||0,
      comm:Number(f.comm)||0,
      start:f.start||'',
      paid:Number(f.paid)||0,
      foremanName:f.foreman||'',
      notes:f.notes||''
    }))
  ];
}
function getVisibleAuctionGroupIds(){
  const memberGroups=getAssignedMemberFunds().map(item=>String(item.id));
  const foremanGroups=S.chits.map(item=>String(item.id));
  return Array.from(new Set([...memberGroups,...foremanGroups]));
}
function formatTimerFromSeconds(totalSeconds){
  const safe=Math.max(0,Number(totalSeconds)||0);
  const h=String(Math.floor(safe/3600)).padStart(2,'0');
  const m=String(Math.floor((safe%3600)/60)).padStart(2,'0');
  const s=String(safe%60).padStart(2,'0');
  return `${h}:${m}:${s}`;
}
function getCurrentAuctionElapsedSecs(session=sharedAuctionSession){
  if(!session) return 0;
  const base=Number(session.elapsedSecs)||0;
  if(session.status!=='live' || !session.startedAt) return base;
  const startedAt=session.startedAt instanceof Date?session.startedAt:new Date(session.startedAt);
  if(Number.isNaN(startedAt.getTime())) return base;
  return base+Math.max(0,Math.floor((Date.now()-startedAt.getTime())/1000));
}
function updateAuctionStartButton(){
  const btn=document.getElementById('aucStartBtn');
  const gid=(document.getElementById('auc_group')||{}).value||'';
  if(!btn) return;
  btn.disabled=!gid;
  btn.style.opacity=gid?'1':'.5';
  btn.style.cursor=gid?'pointer':'not-allowed';
}
function isMemberInActiveAuction(session=sharedAuctionSession){
  if(!session||!session.groupId) return false;
  return getAssignedMemberFunds().some(item=>String(item.id)===String(session.groupId));
}
function renderSharedAuctionSession(){
  const statusEl=document.getElementById('auc_status_lbl');
  const foremanTimer=document.getElementById('auctionTimer');
  const memberTimer=document.getElementById('mem_timer');
  const memberGroupSelect=document.getElementById('mem_bid_grp');
  const session=sharedAuctionSession;
  let label='Ready';
  let timer='00:00:00';
  if(session){
    label=session.status==='live'?'Live':session.status==='paused'?'Paused':'Ready';
    timer=formatTimerFromSeconds(getCurrentAuctionElapsedSecs(session));
  }
  if(statusEl) statusEl.textContent=label;
  if(foremanTimer) foremanTimer.textContent=timer;
  if(memberTimer){
    memberTimer.textContent=isMemberInActiveAuction(session)?timer:'00:00:00';
  }
  if(memberGroupSelect&&session&&session.groupId&&isMemberInActiveAuction(session)){
    memberGroupSelect.value=String(session.groupId);
  }
}
function startAuctionTicker(){
  clearInterval(S.timerInterval);
  if(sharedAuctionSession&&sharedAuctionSession.status==='live'){
    S.timerInterval=setInterval(()=>renderSharedAuctionSession(),1000);
  }
}
function applySharedLiveBidsToState(){
  const visibleIds=new Set(getVisibleAuctionGroupIds());
  S.liveBids=sharedLiveBids.filter(item=>visibleIds.size===0 || visibleIds.has(String(item.gid)));
  renderBids();
}
function applySharedPaymentsToState(){
  sharedPaymentKeys.forEach(key=>{
    delete S.payments[key];
  });
  sharedPaymentKeys=new Set();
  sharedPayments.forEach(item=>{
    const key=`${item.memberId}_${item.groupId}_${item.month}`;
    sharedPaymentKeys.add(key);
    S.payments[key]=!!item.paid;
  });
  renderPayTable();
  renderMyChits();
  renderMPay();
  updateDB();
}
function subscribeSharedPayments(user){
  if(sharedPaymentsUnsubscribe){sharedPaymentsUnsubscribe();sharedPaymentsUnsubscribe=null;}
  sharedPayments=[];
  applySharedPaymentsToState();
  if(!db||!user) return;
  const memberEmail=normalizeEmail(user.email||'');
  const query=userHasForemanAccess(user)
    ? db.collection('paymentRecords').where('foremanUid','==',user.uid)
    : memberEmail
      ? db.collection('paymentRecords').where('memberEmail','==',memberEmail)
      : null;
  if(!query) return;
  sharedPaymentsUnsubscribe=query.onSnapshot(snap=>{
    sharedPayments=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>item&&item.memberId&&item.groupId&&item.month);
    applySharedPaymentsToState();
  },err=>{
    console.error(err);
    toast('Could not load shared payment status.',true);
  });
}
function subscribeSharedLiveBids(user){
  if(sharedLiveBidsUnsubscribe){sharedLiveBidsUnsubscribe();sharedLiveBidsUnsubscribe=null;}
  sharedLiveBids=[];
  applySharedLiveBidsToState();
  if(!db||!user) return;
  sharedLiveBidsUnsubscribe=db.collection('liveBids').onSnapshot(snap=>{
    sharedLiveBids=snap.docs.map(doc=>({id:doc.id,...doc.data()})).map(item=>({
      id:item.id,
      gid:String(item.gid||''),
      groupName:item.groupName||'',
      name:item.name||'',
      amount:Number(item.amount)||0,
      time:item.time||'',
      byForeman:!!item.byForeman,
      bidderKey:item.bidderKey||''
    })).filter(item=>item.gid&&item.name);
    applySharedLiveBidsToState();
  },err=>{
    console.error(err);
    toast('Could not load live auction bids.',true);
  });
}
function subscribeSharedAuctionSession(user){
  if(sharedAuctionSessionUnsubscribe){sharedAuctionSessionUnsubscribe();sharedAuctionSessionUnsubscribe=null;}
  sharedAuctionSession=null;
  renderSharedAuctionSession();
  startAuctionTicker();
  if(!db||!user) return;
  sharedAuctionSessionUnsubscribe=getAuctionSessionRef().onSnapshot(snap=>{
    const data=snap.data();
    if(data){
      sharedAuctionSession={
        groupId:String(data.groupId||''),
        groupName:data.groupName||'',
        status:data.status||'ready',
        elapsedSecs:Number(data.elapsedSecs)||0,
        startedAt:data.startedAt&&data.startedAt.toDate?data.startedAt.toDate():(data.startedAt?new Date(data.startedAt):null)
      };
    }else{
      sharedAuctionSession=null;
    }
    renderSharedAuctionSession();
    startAuctionTicker();
  },err=>{
    console.error(err);
    toast('Could not load live auction session.',true);
  });
}
async function setAuctionSessionState(payload){
  if(!db||!currentUser) return;
  await getAuctionSessionRef().set(payload,{merge:true});
}
async function upsertSharedLiveBid(bid){
  if(!db||!currentUser||!bid||!bid.gid||!bid.bidderKey) return;
  await getLiveBidRef(bid.gid,bid.bidderKey).set({
    gid:String(bid.gid),
    groupName:bid.groupName||'',
    name:bid.name||'',
    amount:Number(bid.amount)||0,
    time:bid.time||'',
    byForeman:!!bid.byForeman,
    bidderKey:bid.bidderKey,
    foremanUid:currentUser.uid||'',
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true});
}
async function clearSharedLiveBidsForGroup(groupId){
  if(!db||!groupId) return;
  const snap=await db.collection('liveBids').where('gid','==',String(groupId)).get();
  if(snap.empty) return;
  const batch=db.batch();
  snap.docs.forEach(doc=>batch.delete(doc.ref));
  await batch.commit();
}
function getAssignedRecordByPaymentGroup(gid){
  const clean=String(gid||'').replace(/^c_/,'');
  return memberAssignments.find(item=>String(item.groupId)===clean)||null;
}
async function setSharedPaymentStatus(opts){
  if(!db||!currentUser||!opts||!opts.memberId||!opts.groupId||!opts.month) return;
  const ref=getPaymentRecordRef(opts.memberId,opts.groupId,opts.month);
  if(opts.paid){
    await ref.set({
      memberId:String(opts.memberId),
      memberEmail:normalizeEmail(opts.memberEmail||''),
      memberName:opts.memberName||'',
      memberTicket:Number(opts.memberTicket)||0,
      groupId:String(opts.groupId),
      groupName:opts.groupName||'',
      month:Number(opts.month),
      amount:Number(opts.amount)||0,
      paid:true,
      foremanUid:opts.foremanUid||currentUser.uid||'',
      updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy:currentUser.email||currentUser.uid||'user'
    },{merge:true});
  }else{
    await ref.delete();
  }
}
function syncMemberAssignments(user){
  if(memberAssignmentsUnsubscribe){memberAssignmentsUnsubscribe();memberAssignmentsUnsubscribe=null;}
  memberAssignments=[];
  if(!db||!user||!user.email){
    popDrops();renderMyChits();renderMPay();
    return;
  }
  const email=normalizeEmail(user.email);
  memberAssignmentsUnsubscribe=db.collection('memberAssignments').where('memberEmail','==',email).onSnapshot(snap=>{
    memberAssignments=snap.docs.map(doc=>({id:doc.id,...doc.data()}));
    popDrops();renderMyChits();renderMPay();updateMpayDetail();
  },err=>{
    console.error(err);
    toast('Could not load member assignments.',true);
  });
}
async function syncMemberAssignmentRecord(member,chit){
  if(!db||!currentUser||!member||!chit)return;
  const email=normalizeEmail(member.email);
  if(!email)return;
  await getMemberAssignmentRef(member.id,chit.id).set({
    memberId:String(member.id),
    memberName:member.name||'',
    memberEmail:email,
    memberTicket:Number(member.ticket)||0,
    groupId:String(chit.id),
    groupName:chit.name||'',
    value:Number(chit.value)||0,
    members:Number(chit.members)||0,
    duration:Number(chit.duration)||0,
    comm:Number(chit.comm)||0,
    start:chit.start||'',
    foremanUid:currentUser.uid||'',
    foremanEmail:normalizeEmail(currentUser.email||''),
    foremanName:currentUser.displayName||currentUser.email||'Foreman',
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true});
}
async function deleteMemberAssignmentRecord(member){
  if(!db||!member||!member.groupId||!member.id||!normalizeEmail(member.email)) return;
  try{
    await getMemberAssignmentRef(member.id,member.groupId).delete();
  }catch(err){
    console.error(err);
  }
}
async function syncExistingMemberAssignments(){
  if(memberAssignmentBackfillDone||!db||!currentUser||!userHasForemanAccess(currentUser)) return;
  memberAssignmentBackfillDone=true;
  const jobs=S.members
    .filter(member=>normalizeEmail(member.email))
    .map(member=>{
      const chit=S.chits.find(item=>String(item.id)===String(member.groupId));
      return chit?syncMemberAssignmentRecord(member,chit):Promise.resolve();
    });
  await Promise.allSettled(jobs);
}
function updateSyncStatus(text,isReady){
  const chip=document.getElementById('authChip');
  const note=document.getElementById('syncNote');
  if(chip){chip.textContent=text;chip.className='auth-chip '+(isReady?'ready':'offline');}
  if(note) note.innerHTML=isReady?`<strong>Synced:</strong> ${text}`:`<strong>Status:</strong> ${text}`;
}
function setAuthError(message){
  const el=document.getElementById('authError');if(!el)return;
  el.textContent=message||'';el.className='auth-error'+(message?' show':'');
}
function updateRoleAccessUI(){
  const hasPaidAccess=userHasForemanAccess(currentUser);
  const roleForeman=document.getElementById('roleForeman');
  const mobRoleForeman=document.getElementById('mobRoleForeman');
  const roleSwitch=document.querySelector('.role-switch');
  const mobRoleStrip=document.getElementById('mobRoleStrip');
  const foremanNav=document.getElementById('foremanNav');
  const topCreateBtn=document.getElementById('topCreateBtn');
  if(roleForeman) roleForeman.style.display=hasPaidAccess?'':'none';
  if(mobRoleForeman) mobRoleForeman.style.display=hasPaidAccess?'':'none';
  if(roleSwitch) roleSwitch.style.display='flex';
  if(mobRoleStrip) mobRoleStrip.style.display=hasPaidAccess?'':'none';
  if(foremanNav&&!hasPaidAccess&&S.role!=='foreman') foremanNav.style.display='none';
  if(topCreateBtn&&!hasPaidAccess) topCreateBtn.style.display='none';
}
function updateAccessUI(){
  const authAccess=document.getElementById('authAccessNote');
  const sideAccess=document.getElementById('accessNote');
  const hasPaidAccess=userHasForemanAccess(currentUser);
  const currentEmail=currentUser&&currentUser.email?currentUser.email:'';
  const memberText=`Members stay on the ${ADMIN_PORTAL_CONFIG.memberPlanLabel.toLowerCase()} plan.`;
  const foremanText=hasPaidAccess&&currentEmail?`Foreman unlocked for ${currentEmail}.`:`Foreman requires administrator approval and uses the ${ADMIN_PORTAL_CONFIG.foremanPlanLabel.toLowerCase()} plan.`;
  if(authAccess) authAccess.innerHTML=`<strong>Access:</strong> ${memberText} ${foremanText}`;
  if(sideAccess) sideAccess.innerHTML=`<strong>Access:</strong> ${S.role==='foreman'&&hasPaidAccess?'Paid Foreman workspace active.':memberText+' '+foremanText}`;
  updateRoleAccessUI();
}
function updateAuthUI(user){
  const loginBtn=document.getElementById('googleLoginBtn');
  const logoutBtn=document.getElementById('logoutBtn');
  const overlay=document.getElementById('authOverlay');
  if(loginBtn) loginBtn.style.display=user?'none':'';
  if(logoutBtn) logoutBtn.style.display=user?'':'none';
  if(overlay) overlay.classList.toggle('show',!user);
  if(user){
    const name=user.displayName||user.email||'Firebase User';
    const grant=getForemanGrant(user.email);
    document.getElementById('sbName').textContent=name;
    document.getElementById('sbRole').textContent=grant?`${grant.plan==='paid'?'Paid Foreman eligible':'Approved'} Â· ${user.email||'Google account'}`:`${ADMIN_PORTAL_CONFIG.memberPlanLabel} Â· ${user.email||'Google account'}`;
    document.getElementById('sbAvatar').textContent=(name.trim()[0]||DEFAULT_AVATAR[S.role]||'U').toUpperCase();
    updateSyncStatus('Connected to Firebase',true);
  }else{
    document.getElementById('sbName').textContent=S.role==='foreman'?'Foreman Admin':'Member View';
    document.getElementById('sbRole').textContent=firebaseConfigured()?'Sign in required':'Add your Firebase config';
    document.getElementById('sbAvatar').textContent=DEFAULT_AVATAR[S.role]||'F';
    updateSyncStatus(firebaseConfigured()?'Waiting for Google login':'Firebase config is still a placeholder',false);
  }
  updateAccessUI();
}
function getUserDocRef(uid){return db.collection('users').doc(uid).collection('private').doc('appState');}
function applyState(data){
  const next=data||{};
  isApplyingRemoteState=true;
  S.role=next.role||'foreman';
  S.theme=next.theme||S.theme||'dark';
  S.chits=Array.isArray(next.chits)?next.chits:[];
  S.members=Array.isArray(next.members)?next.members:[];
  S.payments=next.payments&&typeof next.payments==='object'?next.payments:{};
  S.auctions=Array.isArray(next.auctions)?next.auctions:[];
  S.memberPayments=Array.isArray(next.memberPayments)?next.memberPayments:[];
  S.myChitFunds=Array.isArray(next.myChitFunds)?next.myChitFunds:[];
  S.liveBids=Array.isArray(next.liveBids)?next.liveBids:[];
  S.adCount=Number.isFinite(next.adCount)?next.adCount:0;
  S.cur=next.cur||'dashboard';
  document.documentElement.setAttribute('data-theme',S.theme);
  localStorage.setItem('cv_t',S.theme);
  popDrops();renderMembers();renderPayTable();renderAucHist();renderMPay();renderBids();renderMyChits();renderReports();updateDB();
  document.getElementById('memberBadge').textContent=S.members.length;
  setRole(S.role,false);
  nav(S.cur,null);
  isApplyingRemoteState=false;
}
async function saveStateNow(){
  if(!currentUser||!db||isApplyingRemoteState)return;
  const snapshot=serializableState();
  const hash=stateHash(snapshot);
  if(hash===lastSavedHash)return;
  lastSavedHash=hash;
  await getUserDocRef(currentUser.uid).set({state:snapshot,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:{uid:currentUser.uid,name:currentUser.displayName||currentUser.email||'Google User'}},{merge:true});
  updateSyncStatus('Saved to Firestore',true);
}
function queueCloudSave(immediate=false){
  if(isApplyingRemoteState)return;
  clearTimeout(saveTimer);
  if(!currentUser||!db){updateSyncStatus(firebaseConfigured()?'Sign in to sync changes':'Firebase config is still a placeholder',false);return;}
  const run=()=>saveStateNow().catch(err=>{console.error(err);updateSyncStatus('Sync failed',false);toast('Firebase sync failed. Check console.',true);});
  if(immediate){run();return;}
  saveTimer=setTimeout(run,350);
}
function initializeFirebase(){
  if(!firebaseConfigured()){updateAuthUI(null);setAuthError('Replace the FIREBASE_CONFIG placeholders in this file with your Firebase web app config, then reload the page.');return;}
  if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  auth=firebase.auth();db=firebase.firestore();googleProvider=new firebase.auth.GoogleAuthProvider();authReady=true;setAuthError('');
  auth.onAuthStateChanged(async user=>{
    currentUser=user||null;updateAuthUI(currentUser);
    if(remoteUnsubscribe){remoteUnsubscribe();remoteUnsubscribe=null;}
    if(memberAssignmentsUnsubscribe){memberAssignmentsUnsubscribe();memberAssignmentsUnsubscribe=null;}
    if(accessRegistryUnsubscribe){accessRegistryUnsubscribe();accessRegistryUnsubscribe=null;}
    if(sharedPaymentsUnsubscribe){sharedPaymentsUnsubscribe();sharedPaymentsUnsubscribe=null;}
    if(sharedLiveBidsUnsubscribe){sharedLiveBidsUnsubscribe();sharedLiveBidsUnsubscribe=null;}
    if(sharedAuctionSessionUnsubscribe){sharedAuctionSessionUnsubscribe();sharedAuctionSessionUnsubscribe=null;}
    memberAssignments=[];
    memberAssignmentBackfillDone=false;
    sharedPayments=[];
    sharedPaymentKeys.forEach(key=>delete S.payments[key]);
    sharedPaymentKeys=new Set();
    sharedLiveBids=[];
    S.liveBids=[];
    sharedAuctionSession=null;
    clearInterval(S.timerInterval);
    clearTimeout(saveTimer);
    if(!user){popDrops();renderMyChits();renderMPay();renderForemanAccessList();return;}
    subscribeAccessRegistry();
    syncMemberAssignments(user);
    subscribeSharedPayments(user);
    subscribeSharedLiveBids(user);
    subscribeSharedAuctionSession(user);
    updateSyncStatus('Loading cloud data...',true);
    remoteUnsubscribe=getUserDocRef(user.uid).onSnapshot(async snap=>{
      const payload=snap.data();
      if(payload&&payload.state){lastSavedHash=stateHash(payload.state);applyState(payload.state);if(!userHasForemanAccess(currentUser)&&S.role==='foreman') setRole('member',false);syncExistingMemberAssignments().catch(err=>console.error(err));updateSyncStatus('Live sync active',true);}
      else if(!seededDemo){
        seededDemo=true;
        const starter=userHasForemanAccess(user)?createDemoState():createBlankState();
        applyState(starter);
        await saveStateNow();
        if(userHasForemanAccess(user)) addAct('Your Firebase workspace is ready. Demo data was seeded once.','teal');
      }
    },err=>{console.error(err);updateSyncStatus('Unable to read Firestore',false);toast('Could not load Firebase data.',true);});
  });
}
async function signInWithGoogle(){
  if(!authReady){initializeFirebase();if(!authReady)return;}
  try{setAuthError('');await auth.signInWithPopup(googleProvider);}
  catch(err){
    console.error(err);
    const message=err&&err.code==='auth/popup-blocked'?'Your browser blocked the Google sign-in popup. Allow popups for this page and try again.':err&&err.code==='auth/unauthorized-domain'?'This domain is not in Firebase Auth authorized domains yet. Add your local/dev host in the Firebase console.':'Google sign-in failed. Check your Firebase Auth setup and try again.';
    setAuthError(message);toast('Google sign-in failed.',true);
  }
}
async function signOutUser(){if(auth) await auth.signOut();}

function syncAdminPortalUI(){
  const loginPane=document.getElementById('adminLoginPane');
  const managePane=document.getElementById('adminManagePane');
  if(loginPane) loginPane.style.display=adminSessionActive?'none':'';
  if(managePane) managePane.style.display=adminSessionActive?'':'none';
  const hint=document.getElementById('adminLoginHint');
  if(hint) hint.textContent=adminSessionActive?'Portal unlocked. Manage paid Foreman access below.':'Foreman tools are billed access. Normal members continue to use the free member workspace.';
  renderForemanAccessList();
}
function openAdminPortal(){
  syncAdminPortalUI();
  openModal('adminPortalModal');
}
function adminLogin(){
  const username=(document.getElementById('adminUser').value||'').trim();
  const password=document.getElementById('adminPass').value||'';
  if(username===ADMIN_PORTAL_CONFIG.username&&password===ADMIN_PORTAL_CONFIG.password){
    adminSessionActive=true;
    localStorage.setItem(ADMIN_SESSION_KEY,'1');
    document.getElementById('adminPass').value='';
    syncAdminPortalUI();
    toast('Administrator portal unlocked.');
  }else{
    toast('Administrator credentials are incorrect.',true);
  }
}
function adminLogout(){
  adminSessionActive=false;
  localStorage.removeItem(ADMIN_SESSION_KEY);
  syncAdminPortalUI();
  toast('Administrator portal locked.');
}
function renderForemanAccessList(){
  const list=document.getElementById('adminForemanList');
  const count=document.getElementById('adminForemanCount');
  const stamp=document.getElementById('adminRegistryStamp');
  if(count) count.textContent=String(accessRegistry.foremen.length);
  if(stamp) stamp.textContent=accessRegistry.updatedAt?new Date(accessRegistry.updatedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}):'Now';
  if(!list)return;
  if(!accessRegistry.foremen.length){
    list.innerHTML='<div class="admin-empty">No paid Foreman accounts have been approved yet.<br>Add an email address to grant paid access.</div>';
    return;
  }
  list.innerHTML=accessRegistry.foremen.slice().sort((a,b)=>String(b.grantedAt).localeCompare(String(a.grantedAt))).map(item=>`
    <div class="admin-list-item">
      <div class="admin-list-ico">${(item.name||item.email||'F').trim().charAt(0).toUpperCase()}</div>
      <div class="admin-list-main">
        <div class="admin-list-name">${item.name||'Approved Foreman'}</div>
        <div class="admin-list-email">${item.email}</div>
        <div class="admin-list-meta">
          <span class="admin-pill paid">${ADMIN_PORTAL_CONFIG.foremanPlanLabel}</span>
          <span class="admin-pill time">Granted ${formatWhen(item.grantedAt)}</span>
        </div>
      </div>
      <button class="btn btn-danger btn-sm" type="button" onclick="revokeForemanAccess('${item.email}')">Remove</button>
    </div>`).join('');
}
async function grantForemanAccess(){
  if(!adminSessionActive){toast('Unlock the administrator portal first.',true);return;}
  const email=normalizeEmail(document.getElementById('adminForemanEmail').value);
  const name=(document.getElementById('adminForemanName').value||'').trim();
  if(!isValidEmail(email)){toast('Enter a valid email address for the Foreman.',true);return;}
  const existing=getForemanGrant(email);
  const grantedAt=existing&&existing.grantedAt?existing.grantedAt:new Date().toISOString();
  const nextEntry={email,name:name||(existing&&existing.name)||'',plan:'paid',grantedAt};
  try{
    if(db&&currentUser){
      await getForemanAccessCollection().doc(email).set({
        email,
        name:nextEntry.name,
        plan:'paid',
        grantedAt:existing&&existing.grantedAt&&firebase.firestore.Timestamp?firebase.firestore.Timestamp.fromDate(new Date(existing.grantedAt)):firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy:currentUser.email||currentUser.uid||'admin'
      },{merge:true});
    }else{
      if(existing){
        accessRegistry.foremen=accessRegistry.foremen.map(item=>item.email===email?nextEntry:item);
      }else{
        accessRegistry.foremen.unshift(nextEntry);
      }
      saveAccessRegistry();
    }
    toast(existing?'Foreman access updated.':'Foreman access granted.');
  }catch(err){
    console.error(err);
    toast('Could not save Foreman access.',true);
    return;
  }
  document.getElementById('adminForemanEmail').value='';
  document.getElementById('adminForemanName').value='';
  if(currentUser&&normalizeEmail(currentUser.email)===email){
    updateAuthUI(currentUser);
    setRole('foreman',false);
    toast('Foreman access is now active for the current signed-in user.');
  }
}
async function revokeForemanAccess(email){
  if(!adminSessionActive){toast('Unlock the administrator portal first.',true);return;}
  const key=normalizeEmail(email);
  try{
    if(db&&currentUser){
      await getForemanAccessCollection().doc(key).delete();
    }else{
      accessRegistry.foremen=accessRegistry.foremen.filter(item=>item.email!==key);
      saveAccessRegistry();
    }
  }catch(err){
    console.error(err);
    toast('Could not remove Foreman access.',true);
    return;
  }
  if(currentUser&&normalizeEmail(currentUser.email)===key&&S.role==='foreman'){
    setRole('member',false);
    toast('Current user was moved to the free member workspace.',true);
  }else{
    toast('Foreman access removed.');
  }
}

/* â”€â”€ THEME â”€â”€ */
function toggleTheme(){S.theme=S.theme==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',S.theme);localStorage.setItem('cv_t',S.theme);queueCloudSave();}
(()=>{const t=localStorage.getItem('cv_t');if(t){S.theme=t;document.documentElement.setAttribute('data-theme',t);}})();

/* â”€â”€ TOAST â”€â”€ */
function toast(msg,err=false){const el=document.getElementById('toast');document.getElementById('t-msg').textContent=msg;document.getElementById('t-icon').textContent=err?'âœ—':'âœ“';el.className='toast show'+(err?' err':'');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2800);}

/* â”€â”€ MODAL â”€â”€ */
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function maybeAd(){S.adCount++;if(S.adCount%4===0)openModal('adModal');}

/* â”€â”€ SIDEBAR â”€â”€ */
function openSB(){document.getElementById('sidebar').classList.add('open');document.getElementById('sbOverlay').classList.add('open');}
function closeSB(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sbOverlay').classList.remove('open');}

/* â”€â”€ MOBILE NAV ITEMS â”€â”€ */
const FN=[{id:'dashboard',svg:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',lbl:'Home'},
{id:'members',svg:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>',lbl:'Members',bid:true},
{id:'payments',svg:'<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',lbl:'Payments'},
{id:'auction',svg:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',lbl:'Auction'},
{id:'reports',svg:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',lbl:'Reports'}];
const MN=[{id:'m_dashboard',svg:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',lbl:'Home'},
{id:'m_payments',svg:'<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',lbl:'Payments'},
{id:'m_auction',svg:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',lbl:'Auction'},
{id:'m_emi',svg:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/>',lbl:'EMI'},
{id:'notifications',svg:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',lbl:'Alerts'}];

function renderMN(){
  const items=S.role==='foreman'?FN:MN;
  const mc=S.members.length;
  document.getElementById('mnInner').innerHTML=items.map(it=>`
    <button class="mn-item${S.cur===it.id?' active':''}" onclick="nav('${it.id}',null)" type="button">
      <div class="mn-icon-wrap">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${it.svg}</svg>
      </div>
      <span>${it.lbl}</span>
      ${it.bid&&mc?`<span class="mn-badge">${mc}</span>`:''}
    </button>`).join('');
}

/* â”€â”€ ROLE â”€â”€ */
function setRole(r,sync=true){
  if(r==='foreman'&&currentUser&&!userHasForemanAccess(currentUser)){
    toast('Foreman access requires administrator approval. Member access is still free.',true);
    r='member';
  }
  S.role=r;
  document.getElementById('roleForeman').className='role-btn'+(r==='foreman'?' active':'');
  document.getElementById('roleMember').className='role-btn'+(r==='member'?' active':'');
  document.getElementById('mobRoleForeman').className='mob-role-btn'+(r==='foreman'?' active':'');
  document.getElementById('mobRoleMember').className='mob-role-btn'+(r==='member'?' active':'');
  document.getElementById('foremanNav').style.display=r==='foreman'?'':'none';
  document.getElementById('memberNav').style.display=r==='member'?'':'none';
  document.getElementById('topCreateBtn').style.display=r==='foreman'?'':'none';
  if(!currentUser){
    document.getElementById('sbName').textContent=r==='foreman'?'Foreman Admin':'Member View';
    document.getElementById('sbRole').textContent=r==='foreman'?'Fund Manager':'Subscriber';
    document.getElementById('sbAvatar').textContent=DEFAULT_AVATAR[r]||'F';
  }
  nav(r==='foreman'?'dashboard':'m_dashboard',null);
  if(r==='member') renderMyChits();
  popDrops();
  updateAccessUI();
  if(sync) queueCloudSave();
}

/* â”€â”€ NAV â”€â”€ */
const TITLES={dashboard:'Fund Dashboard',members:'Member Registry',payments:'Payment Tracker',auction:'Auction Management',emi:'EMI Calculator',reports:'Reports & History',notifications:'Alerts & Reminders',m_dashboard:'My Dashboard',m_payments:'My Payments',m_auction:'Live Auction',m_emi:'My EMI Calc'};
function nav(sec,el){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const se=document.getElementById('sec-'+sec);
  if(se) se.classList.add('active');
  if(el){
    el.classList.add('active');
  } else {
    // Activate matching sidebar nav item when navigating from mobile nav
    document.querySelectorAll('.nav-item').forEach(n=>{
      if(n.getAttribute('onclick')&&n.getAttribute('onclick').includes("'"+sec+"'")) n.classList.add('active');
    });
  }
  document.getElementById('topTitle').innerHTML=(TITLES[sec]||sec).replace(/(\S+)$/,'<span>$1</span>');
  S.cur=sec;closeSB();
  if(sec==='reports') renderReports();
  if(sec==='m_dashboard') renderMyChits();
  if(sec==='auction'||sec==='m_auction') renderBids();
  renderMN();
}

/* â”€â”€ CHIT â”€â”€ */
function saveChit(){
  const name=document.getElementById('cm_name').value.trim();
  const value=parseFloat(document.getElementById('cm_value').value);
  const members=parseInt(document.getElementById('cm_members').value);
  const duration=parseInt(document.getElementById('cm_duration').value);
  const comm=parseFloat(document.getElementById('cm_comm').value)||5;
  const start=document.getElementById('cm_start').value;
  if(!name||!value||!members||!duration){toast('Fill all chit details!',true);return;}
  S.chits.push({id:Date.now(),name,value,members,duration,comm,start,created:new Date().toLocaleDateString('en-IN')});
  closeModal('chitModal');toast(`"${name}" created!`);maybeAd();
  ['cm_name','cm_value','cm_members','cm_duration','cm_start'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('cm_comm').value='5';
  queueCloudSave();
  popDrops();updateDB();addAct(`Chit "${name}" created â€” ${fmt(value)} / ${members} members`,'gold');
}

function popDrops(){
  const ids=['mm_group','pt_group','auc_group','notif_group','m_filter','mem_bid_grp','fm_bid_grp'];
  const memberFundOptions=getAssignedMemberFunds().map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  ids.forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const cur=el.value;
    const baseOptions=S.chits.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    const options=id==='mem_bid_grp'&&S.role==='member'?memberFundOptions:baseOptions;
    el.innerHTML=(id==='m_filter'?'<option value="">All Groups</option>':'<option value="">â€” Select â€”</option>')+options;
    if(cur) el.value=cur;
  });
  // Populate fm_bid_member when fm_bid_grp changes
  const fmGrp=document.getElementById('fm_bid_grp');
  const fmMem=document.getElementById('fm_bid_member');
  if(fmGrp&&fmMem){
    fmGrp.onchange=function(){
      const gid=this.value;
      const mems=S.members.filter(m=>m.groupId==gid);
      fmMem.innerHTML='<option value="">â€” Select Member â€”</option>'+mems.map(m=>`<option value="${m.name}">${m.name}</option>`).join('');
    };
    // Trigger if already selected
    if(fmGrp.value) fmGrp.onchange.call(fmGrp);
  }
  // My Payments dropdown: foreman chits + member's own funds
  const mpGrp=document.getElementById('mp_grp');
  if(mpGrp){
    const cur=mpGrp.value;
    const assignedOptions=getAssignedMemberFunds().map(c=>`<option value="c_${c.id}">${c.name} (Assigned)</option>`).join('');
    mpGrp.innerHTML='<option value="">â€” Select Group â€”</option>'+
      assignedOptions+
      S.myChitFunds.map(f=>`<option value="m_${f.id}">${f.name} (My Fund)</option>`).join('');
    if(cur) mpGrp.value=cur;
  }
  const bidName=document.getElementById('mem_bid_name');
  const matches=getMatchedMembers();
  if(bidName&&!bidName.value&&matches.length===1) bidName.value=matches[0].name||'';
  updateAuctionStartButton();
  renderSharedAuctionSession();
}

function foremanAddBid(){
  const gid=document.getElementById('fm_bid_grp').value;
  const name=(document.getElementById('fm_bid_member').value||'').trim();
  const bid=parseFloat(document.getElementById('fm_bid_amt').value)||0;
  if(!gid){toast('Select a chit group!',true);return;}
  if(!name){toast('Select a member!',true);return;}
  if(!bid||bid<=0){toast('Enter a valid bid amount!',true);return;}
  const c=S.chits.find(c=>c.id==gid);if(!c){toast('Group not found',true);return;}
  const bidObj={id:`${gid}_foreman_${name.toLowerCase().replace(/\s+/g,'_')}`,name,gid:String(gid),groupName:c.name,amount:bid,time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),byForeman:true,bidderKey:`foreman_${name.toLowerCase().replace(/\s+/g,'_')}`};
  document.getElementById('fm_bid_amt').value='';
  upsertSharedLiveBid(bidObj).then(()=>{
    toast(`Bid of ${fmt(bid)} added for ${name}!`);
    addAct(`Foreman added bid ${fmt(bid)} for ${name}`,'blue');
  }).catch(err=>{
    console.error(err);
    toast('Could not send live bid online.',true);
  });
  queueCloudSave();
}

/* â”€â”€ MEMBERS â”€â”€ */
function openAddMember(){popDrops();openModal('memberModal');}
const CLR=['#d4a843','#17c4a2','#4f9cf9','#e85555','#3dcc8a','#9b79f5','#f09c4a'];

function saveMember(){
  const name=document.getElementById('mm_name').value.trim();
  const phone=document.getElementById('mm_phone').value.trim();
  const email=normalizeEmail(document.getElementById('mm_email').value.trim());
  const gid=document.getElementById('mm_group').value;
  const ticket=parseInt(document.getElementById('mm_ticket').value)||S.members.length+1;
  if(!name||!phone||!gid){toast('Fill name, phone & group!',true);return;}
  const grp=S.chits.find(c=>c.id==gid);
  const member={id:Date.now(),name,phone,email,groupId:gid,groupName:grp?grp.name:'',ticket,color:CLR[S.members.length%CLR.length],prized:false};
  S.members.push(member);
  closeModal('memberModal');toast(`${name} added!`);
  ['mm_name','mm_phone','mm_email','mm_ticket'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('mm_group').value='';
  renderMembers();updateDB();
  document.getElementById('memberBadge').textContent=S.members.length;
  addAct(`${name} added to ${grp?grp.name:'group'}`,'teal');
  queueCloudSave();
  if(grp&&email) syncMemberAssignmentRecord(member,grp).catch(err=>console.error(err));
}

function renderMembers(){
  const search=(document.getElementById('m_search').value||'').toLowerCase();
  const gf=document.getElementById('m_filter').value;
  const list=S.members.filter(m=>(m.name.toLowerCase().includes(search)||m.phone.includes(search))&&(!gf||m.groupId==gf));
  const el=document.getElementById('memberList');
  if(!list.length){el.innerHTML='<div class="empty"><div class="empty-icon">ðŸ‘¥</div><p>No members found.</p></div>';return;}
  el.innerHTML=list.map(m=>`
    <div class="member-row">
      <div class="av" style="background:${m.color}22;color:${m.color};border:1px solid ${m.color}33">${m.name[0].toUpperCase()}</div>
      <div class="m-info"><div class="m-name">${m.name}</div><div class="m-meta">ðŸ“± ${m.phone} Â· #${m.ticket} Â· ${m.groupName}</div></div>
      <div class="row-actions">
        ${m.prized?'<span class="badge bgold">Prized</span>':'<span class="badge bg">Active</span>'}
        <button class="btn btn-icon btn-sm" onclick="togglePrize(${m.id})">ðŸ†</button>
        <button class="btn btn-icon btn-sm btn-danger" onclick="removeMember(${m.id})">âœ•</button>
      </div>
    </div>`).join('');
}
function togglePrize(id){const m=S.members.find(m=>m.id===id);if(m){m.prized=!m.prized;renderMembers();toast(m.name+(m.prized?' prized':' active'));queueCloudSave();}}
function removeMember(id){const m=S.members.find(m=>m.id===id);S.members=S.members.filter(m=>m.id!==id);renderMembers();updateDB();document.getElementById('memberBadge').textContent=S.members.length;if(m){toast(`${m.name} removed.`);deleteMemberAssignmentRecord(m);}queueCloudSave();}

/* â”€â”€ PAYMENTS â”€â”€ */
function renderPayTable(){
  const gid=document.getElementById('pt_group').value;
  const mo=parseInt(document.getElementById('pt_month').value)||0;
  const list=document.getElementById('payMemberList');
  const progCard=document.getElementById('pay_progress_card');
  if(!gid||!mo){
    progCard.style.display='none';
    list.innerHTML='<div style="text-align:center;padding:48px 20px;color:var(--t3);"><div style="font-size:36px;margin-bottom:12px;opacity:.3;">ðŸ’³</div><p style="font-size:13px;">Select a group and month<br>to track payments</p></div>';
    return;
  }
  const chit=S.chits.find(c=>c.id==gid);if(!chit)return;
  const mems=S.members.filter(m=>m.groupId==gid);
  if(!mems.length){
    progCard.style.display='none';
    list.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--t3);"><div style="font-size:30px;margin-bottom:10px;opacity:.3;">ðŸ‘¥</div><p style="font-size:13px;">No members in this group</p></div>';
    return;
  }
  const mly=chit.value/chit.members;
  let paid=0,due=0;
  const items=mems.map(m=>{
    const k=`${m.id}_${gid}_${mo}`;const ip=!!S.payments[k];ip?paid++:due++;
    return {m,k,ip,mly};
  });
  const pp=mems.length?paid/mems.length*100:0;
  progCard.style.display='';
  document.getElementById('pay_group_title').textContent=chit.name+' â€” Month '+mo;
  document.getElementById('pt_pct').textContent=pp.toFixed(0)+'%';
  document.getElementById('pay_track_fill').style.width=pp+'%';
  document.getElementById('pt_col').textContent=fmt(paid*mly);
  document.getElementById('pt_out').textContent=fmt(due*mly);
  document.getElementById('pt_cc').textContent=paid;
  list.innerHTML=items.map(({m,k,ip})=>`
    <div class="pay-member-item ${ip?'is-paid':'is-due'}">
      <div class="pay-av" style="background:${m.color}22;color:${m.color};border:1px solid ${m.color}33">${m.name[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0;">
        <div class="pay-member-name">${m.name}</div>
        <div class="pay-member-meta">#${m.ticket} Â· ${fmtN(mly)}</div>
      </div>
      <span style="font-size:11px;font-weight:600;color:${ip?'var(--green)':'var(--red)'};margin-right:10px;">${ip?'Paid':'Due'}</span>
      <button class="pay-toggle ${ip?'is-paid':'is-due'}" onclick="togPay('${m.id}','${gid}','${mo}',${mly},'${escJsSingle(m.email)}','${escJsSingle(m.name)}','${m.ticket||0}','${escJsSingle(chit.name)}')" type="button" title="${ip?'Mark as due':'Mark as paid'}"></button>
    </div>`).join('');
}
async function togPay(memberId,gid,mo,amt,memberEmail,memberName,memberTicket,groupName){
  const key=`${memberId}_${gid}_${mo}`;
  const next=!S.payments[key];
  S.payments[key]=next;
  renderPayTable();
  updateDB();
  try{
    await setSharedPaymentStatus({
      memberId,
      groupId:gid,
      month:mo,
      amount:amt,
      paid:next,
      memberEmail,
      memberName,
      memberTicket,
      groupName,
      foremanUid:currentUser&&currentUser.uid?currentUser.uid:''
    });
    toast(next?'Marked as paid':'Marked as due');
  }catch(err){
    console.error(err);
    S.payments[key]=!next;
    renderPayTable();
    updateDB();
    toast('Could not update payment status online.',true);
  }
  queueCloudSave();
}

/* â”€â”€ AUCTION TIMER â”€â”€ */
function handleAuctionGroupChange(){
  calcAuction();
  updateAuctionStartButton();
}
async function startTimer(){
  const gid=(document.getElementById('auc_group').value||'').trim();
  if(!gid){toast('Select a chit group before starting the auction.',true);return;}
  const chit=S.chits.find(c=>String(c.id)===String(gid));
  if(!chit){toast('Selected chit group was not found.',true);return;}
  try{
    await setAuctionSessionState({
      groupId:String(gid),
      groupName:chit.name||'',
      status:'live',
      elapsedSecs:0,
      startedAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy:currentUser&&currentUser.email?currentUser.email:(currentUser&&currentUser.uid?currentUser.uid:'foreman')
    });
    toast('Auction started for the selected chit fund.');
  }catch(err){
    console.error(err);
    toast('Could not start the auction online.',true);
  }
}
async function pauseTimer(){
  try{
    await setAuctionSessionState({
      status:'paused',
      elapsedSecs:getCurrentAuctionElapsedSecs(),
      startedAt:null,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy:currentUser&&currentUser.email?currentUser.email:(currentUser&&currentUser.uid?currentUser.uid:'foreman')
    });
  }catch(err){
    console.error(err);
    toast('Could not pause the auction timer.',true);
  }
}
async function resetTimer(){
  try{
    await setAuctionSessionState({
      groupId:'',
      groupName:'',
      status:'ready',
      elapsedSecs:0,
      startedAt:null,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy:currentUser&&currentUser.email?currentUser.email:(currentUser&&currentUser.uid?currentUser.uid:'foreman')
    });
    const groupSelect=document.getElementById('auc_group');
    if(groupSelect) groupSelect.value='';
    updateAuctionStartButton();
  }catch(err){
    console.error(err);
    toast('Could not reset the auction timer.',true);
  }
}

function calcAuction(){
  const gid=document.getElementById('auc_group').value;
  const bid=parseFloat(document.getElementById('auc_bid').value)||0;
  if(!gid)return;
  const c=S.chits.find(c=>c.id==gid);if(!c)return;
  const mo=c.value/c.members,comm=(c.comm/100)*c.value,disc=Math.min(bid,c.value-comm);
  const div=disc/c.members,ni=mo-div,prize=c.value-comm-disc;
  document.getElementById('ar_cv').textContent=fmt(c.value);
  document.getElementById('ar_mo').textContent=fmt(mo);
  document.getElementById('ar_pl').textContent=fmt(mo*c.members);
  document.getElementById('ar_cm').textContent=fmt(comm);
  document.getElementById('ar_dc').textContent=fmt(disc);
  document.getElementById('ar_dv').textContent=fmt(div);
  document.getElementById('ar_ni').textContent=fmt(ni);
  document.getElementById('ar_pr').textContent=fmt(prize);
}
function closeAuctionWithWinner(bidId){
  const bid=S.liveBids.find(b=>b.id===bidId);if(!bid)return;
  const c=S.chits.find(c=>c.id==bid.gid);if(!c){toast('Chit group not found',true);return;}
  // Auto-fill finalize form
  document.getElementById('auc_group').value=bid.gid;
  document.getElementById('auc_winner').value=bid.name;
  document.getElementById('auc_bid').value=bid.amount;
  // Get next month number
  const prevAuctions=S.auctions.filter(a=>a.groupName===c.name);
  document.getElementById('auc_month').value=prevAuctions.length+1;
  calcAuction();
  // Scroll to finalize section
  document.getElementById('auc_group').closest('.card').scrollIntoView({behavior:'smooth',block:'start'});
  toast('Highest bid loaded â€” review and confirm!');
}
function finalizeAuction(){
  const gid=document.getElementById('auc_group').value,mo=document.getElementById('auc_month').value;
  const bid=parseFloat(document.getElementById('auc_bid').value)||0,winner=document.getElementById('auc_winner').value.trim();
  if(!gid||!mo||!winner){toast('Fill all auction fields!',true);return;}
  const c=S.chits.find(c=>c.id==gid);
  const comm=(c.comm/100)*c.value,disc=Math.min(bid,c.value-comm),div=disc/c.members,prize=c.value-comm-disc;
  S.auctions.push({id:Date.now(),month:mo,groupName:c.name,winner,discount:disc,dividend:div,prize,comm});
  // Clear live bids for this group
  S.liveBids=S.liveBids.filter(b=>b.gid!=gid);
  clearSharedLiveBidsForGroup(gid).catch(err=>console.error(err));
  resetTimer().catch(err=>console.error(err));
  renderAucHist();renderBids();toast(`${winner} wins ${fmt(prize)}!`);maybeAd();updateDB();
  addAct(`Month ${mo} auction: ${winner} wins ${fmt(prize)}`,'gold');
  ['auc_month','auc_bid','auc_winner'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('auc_group').value='';
  calcAuction();
  queueCloudSave();
}
function renderAucHist(){
  const el=document.getElementById('auc_hist');
  if(!S.auctions.length){el.innerHTML='<div class="empty"><div class="empty-icon">ðŸ”¨</div><p>No auctions yet.</p></div>';return;}
  el.innerHTML=S.auctions.slice().reverse().map(a=>`
    <div class="auc-hist-row">
      <div class="auc-hist-mo-chip"><span>Mo</span><span>${a.month}</span></div>
      <div class="auc-hist-info">
        <div class="auc-hist-winner">${a.winner}</div>
        <div class="auc-hist-sub">${a.groupName} Â· Div: ${fmt(a.dividend)}/mbr</div>
      </div>
      <div class="auc-hist-prize">${fmt(a.prize)}</div>
    </div>`).join('');
}

/* â”€â”€ EMI â”€â”€ */
function calcEMI(){
  const val=parseFloat(document.getElementById('e_val').value)||0;
  const mem=parseInt(document.getElementById('e_mem').value)||0;
  const dur=parseInt(document.getElementById('e_dur').value)||0;
  const comm=parseFloat(document.getElementById('e_comm').value)||5;
  const disc=parseFloat(document.getElementById('e_disc').value)||0;
  const fd=parseFloat(document.getElementById('e_fd').value)||7;
  if(!val||!mem)return;
  const mo=val/mem,fc=(comm/100)*val,ad=Math.min(disc,val-fc),div=ad/mem,ni=mo-div,pr=val-fc-ad;
  const mos=dur||mem,tot=mo*mos,fte=fc*mos;
  const ec=(fc/pr)*(12/mos)*100,mc=(fc/val)*(12/Math.ceil(mos/2))*100;
  const fdr=fd/100/12;let fdm=0;
  for(let i=0;i<mos;i++) fdm+=mo*Math.pow(1+fdr,mos-i);
  const fdi=fdm-tot;
  document.getElementById('er_mo').textContent=fmt(mo);
  document.getElementById('er_net').textContent=fmt(ni);
  document.getElementById('er_dv').textContent=fmt(div);
  document.getElementById('er_pr').textContent=fmt(pr);
  const er=document.getElementById('emi_results');if(er)er.style.display='';
  const eb=document.getElementById('emi_breakdown');if(eb)eb.style.display='';
  const ef=document.getElementById('emi_fd_card');if(ef)ef.style.display='';
  document.getElementById('ed_cv').textContent=fmt(val);
  document.getElementById('ed_cm').textContent=fmt(fc);
  document.getElementById('ed_dc').textContent=fmt(ad);
  document.getElementById('ed_dv').textContent=fmt(div);
  document.getElementById('ed_tot').textContent=fmt(tot);
  document.getElementById('ed_fe').textContent=fmt(fte);
  document.getElementById('ed_ew').textContent=pct(ec);
  document.getElementById('ed_mw').textContent=pct(mc);
  document.getElementById('ec_inv').textContent=fmt(tot);
  document.getElementById('ec_fd').textContent=fmt(fdm.toFixed(0));
  document.getElementById('ec_fi').textContent=fmt(fdi.toFixed(0));
  document.getElementById('ec_cc').textContent=fmt(fc);
  document.getElementById('ec_v').textContent=fdi>fc?`FD earns â‚¹${fmtN((fdi-fc).toFixed(0))} more than chit cost. But chit gives auction liquidity!`:`Chit commission (${fmt(fc)}) compared to FD interest earned (${fmt(fdi.toFixed(0))}). Chit offers early fund access.`;
}
function resolveFund(val){
  if(!val) return null;
  if(val.startsWith('c_')){const id=val.slice(2);return S.chits.find(c=>c.id==id)||null;}
  if(val.startsWith('m_')){const id=val.slice(2);return S.myChitFunds.find(f=>f.id==id)||null;}
  // legacy fallback
  return S.chits.find(c=>c.id==val)||S.myChitFunds.find(f=>f.id==val)||null;
}
function updateMpayDetail(){
  const gid=document.getElementById('mp_grp').value;
  const mo=parseInt(document.getElementById('mp_mo').value)||0;
  const el=document.getElementById('mp_det');
  if(!gid||!mo){el.innerHTML='';return;}
  const c=resolveFund(gid);if(!c){el.innerHTML='';return;}
  const mly=c.value/c.members;
  el.innerHTML=`<div class="mpay-amount-display"><div class="mpay-amount-lbl">Amount Due â€” Month ${mo}</div><div class="mpay-amount-val">${fmt(mly)}</div></div>`;
}
function calcMemberEMI(){
  const val=parseFloat(document.getElementById('me_val').value)||0;
  const mem=parseInt(document.getElementById('me_mem').value)||0;
  const comm=parseFloat(document.getElementById('me_comm').value)||5;
  const disc=parseFloat(document.getElementById('me_disc').value)||0;
  if(!val||!mem)return;
  const mo=val/mem,fc=(comm/100)*val,div=Math.min(disc,val-fc)/mem,ni=mo-div;
  document.getElementById('me_res').innerHTML=`
    <div class="card">
      <div class="card-hd"><span class="pip"></span>Your Breakdown</div>
      <div class="emi-result-strip" style="margin-bottom:0;">
        <div class="emi-pill g"><div class="emi-pill-val">${fmt(mo)}</div><div class="emi-pill-lbl">Gross EMI</div></div>
        <div class="emi-pill b"><div class="emi-pill-val">${fmt(div)}</div><div class="emi-pill-lbl">Dividend</div></div>
        <div class="emi-pill t"><div class="emi-pill-val">${fmt(ni)}</div><div class="emi-pill-lbl">Net Payment</div></div>
        <div class="emi-pill p"><div class="emi-pill-val">${fmt(val-fc-Math.min(disc,val-fc))}</div><div class="emi-pill-lbl">Prize Pool</div></div>
      </div>
    </div>`;
}

/* â”€â”€ REPORTS â”€â”€ */
function renderReports(){
  const tv=S.chits.reduce((a,c)=>a+c.value,0);
  const tc=S.chits.reduce((a,c)=>a+(c.comm/100)*c.value*c.duration,0);
  document.getElementById('rp_f').textContent=fmt(tv);
  document.getElementById('rp_fc').textContent=S.chits.length+' chit(s)';
  document.getElementById('rp_m').textContent=S.members.length;
  document.getElementById('rp_a').textContent=S.auctions.length;
  document.getElementById('rp_c').textContent=fmt(tc);
  document.getElementById('rp_ct').innerHTML=S.chits.length?S.chits.map(c=>`<tr><td>${c.name}</td><td>${fmtN(c.value)}</td><td>${c.members}</td><td>${c.duration} mo.</td><td>${fmtN(c.value/c.members)}</td><td><span class="badge bg">Active</span></td></tr>`).join(''):`<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:20px;">No funds yet</td></tr>`;
  document.getElementById('rp_at').innerHTML=S.auctions.length?S.auctions.map(a=>`<tr><td>Mo.${a.month}</td><td>${a.groupName}</td><td>${a.winner}</td><td>${fmt(a.discount)}</td><td>${fmt(a.dividend)}</td><td style="color:var(--gold2);font-weight:500;">${fmt(a.prize)}</td></tr>`).join(''):`<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:20px;">No auctions yet</td></tr>`;
  if(S.chits.length){
    const cols=['var(--gold2)','var(--teal)','var(--blue)','var(--purple)','var(--green)'];
    const mx=Math.max(...S.chits.map(c=>c.value));
    document.getElementById('colChart').innerHTML=`<div class="chart-bars">${S.chits.map((c,i)=>`<div class="chart-bw"><div class="chart-b" style="height:${Math.max(8,Math.round(c.value/mx*80))}px;background:${cols[i%cols.length]};opacity:.85;"></div><div class="chart-bl">${c.name.substring(0,5)}</div></div>`).join('')}</div><div style="font-size:10px;color:var(--t3);margin-top:6px;font-family:'IBM Plex Mono',monospace;">Monthly collection by group</div>`;
  }
}

/* â”€â”€ NOTIFICATIONS â”€â”€ */
function sendNotif(){
  const gid=document.getElementById('notif_group').value;
  const type=document.getElementById('notif_type').value;
  const msg=document.getElementById('notif_msg').value.trim();
  const grp=S.chits.find(c=>c.id==gid);
  const text=msg||(type+(grp?` for ${grp.name}`:''));
  document.getElementById('notifLog').insertAdjacentHTML('afterbegin',`<div class="notif-item"><div class="ndot-sm" style="background:var(--teal)"></div><div><div class="notif-text">${text}</div><div class="notif-time">Just now</div></div></div>`);
  document.getElementById('notif_msg').value='';toast('Notification sent!');
}

/* â”€â”€ MEMBER VIEW â”€â”€ */
function loadMemberView(){
  const gid=document.getElementById('mem_mygrp').value;if(!gid)return;
  const c=S.chits.find(c=>c.id==gid);if(!c)return;
  const mo=c.value/c.members;
  document.getElementById('md_v').textContent=fmt(c.value);
  document.getElementById('md_g').textContent=c.name;
  document.getElementById('md_p').textContent=Object.keys(S.payments).filter(k=>k.includes(`_${gid}_`)&&S.payments[k]).length;
  document.getElementById('md_d').textContent=fmt(0);
  document.getElementById('mem_stat').innerHTML=`<div class="rr"><span class="rr-k">Chit Value</span><span class="rr-v">${fmt(c.value)}</span></div><div class="rr"><span class="rr-k">Monthly Instalment</span><span class="rr-v gold">${fmt(mo)}</span></div><div class="rr"><span class="rr-k">Duration</span><span class="rr-v">${c.duration} months</span></div><div class="rr"><span class="rr-k">Commission</span><span class="rr-v rd">${c.comm}%</span></div><div class="rr"><span class="rr-k">Status</span><span class="rr-v"><span class="badge bg">Active Member</span></span></div>`;
}
async function makePayment(){
  const gid=document.getElementById('mp_grp').value;
  const mo=parseInt(document.getElementById('mp_mo').value);
  if(!gid||!mo){toast('Select group and month!',true);return;}
  const c=resolveFund(gid);if(!c){toast('Fund not found',true);return;}
  // Check for duplicate
  const already=S.memberPayments.find(p=>p.gid===gid&&p.month===mo)
    || sharedPayments.find(p=>`c_${p.groupId}`===gid&&Number(p.month)===mo&&normalizeEmail(p.memberEmail)===getCurrentUserEmail());
  if(already){toast('Month '+mo+' already paid!',true);return;}
  const amount=c.value/c.members;
  const record={gid,month:mo,groupName:c.name,amount,date:new Date().toLocaleDateString('en-IN'),status:'Paid'};
  S.memberPayments.push(record);
  // If it's a member-added fund, update the paid count
  if(gid.startsWith('m_')){
    const fid=gid.slice(2);
    const idx=S.myChitFunds.findIndex(f=>f.id==fid);
    if(idx>-1){
      const maxPaid=Math.max(...S.memberPayments.filter(p=>p.gid===gid).map(p=>p.month));
      S.myChitFunds[idx].paid=maxPaid;
    }
    renderMyChits();
    renderMPay();
    toast(`Month ${mo} payment recorded!`);
    queueCloudSave();
    return;
  }
  const assignment=getAssignedRecordByPaymentGroup(gid);
  if(!assignment){
    S.memberPayments=S.memberPayments.filter(p=>!(p.gid===gid&&p.month===mo));
    renderMPay();
    toast('Member assignment not found for this payment.',true);
    return;
  }
  const key=`${assignment.memberId}_${assignment.groupId}_${mo}`;
  S.payments[key]=true;
  renderMyChits();
  renderMPay();
  updateDB();
  try{
    await setSharedPaymentStatus({
      memberId:assignment.memberId,
      groupId:assignment.groupId,
      month:mo,
      amount,
      paid:true,
      memberEmail:assignment.memberEmail,
      memberName:assignment.memberName,
      memberTicket:assignment.memberTicket,
      groupName:assignment.groupName,
      foremanUid:assignment.foremanUid||''
    });
    toast(`Month ${mo} payment recorded!`);
  }catch(err){
    console.error(err);
    delete S.payments[key];
    S.memberPayments=S.memberPayments.filter(p=>!(p.gid===gid&&p.month===mo));
    renderMyChits();
    renderMPay();
    updateDB();
    toast('Could not record payment online.',true);
    return;
  }
  queueCloudSave();
}
function renderMPay(){
  const el=document.getElementById('mp_rec');
  const sharedHistory=sharedPayments
    .filter(p=>normalizeEmail(p.memberEmail)===getCurrentUserEmail())
    .map(p=>({gid:`c_${p.groupId}`,month:Number(p.month),groupName:p.groupName,amount:Number(p.amount)||0,date:'Online sync',status:p.paid?'Paid':'Due'}));
  const combined=[...S.memberPayments,...sharedHistory].filter((item,index,arr)=>arr.findIndex(x=>x.gid===item.gid&&x.month===item.month)===index);
  if(!combined.length){el.innerHTML='<div class="empty"><div class="empty-icon">ðŸ’³</div><p>No records yet.</p></div>';return;}
  el.innerHTML=combined.slice().sort((a,b)=>b.month-a.month).map(p=>`
    <div class="mpay-hist-item">
      <div class="mpay-hist-mo">M${p.month}</div>
      <div style="flex:1;min-width:0;">
        <div class="mpay-hist-group">${p.groupName}</div>
        <div class="mpay-hist-date">${p.date} Â· <span style="color:var(--green);font-weight:600;">${p.status}</span></div>
      </div>
      <div class="mpay-hist-amt">${fmt(p.amount)}</div>
    </div>`).join('');
}
function placeBid(){
  const bid=parseFloat(document.getElementById('mem_bid').value)||0;
  const name=(document.getElementById('mem_bid_name').value||'').trim();
  const gid=document.getElementById('mem_bid_grp').value;
  if(!gid){toast('Select a chit group!',true);return;}
  if(!name){toast('Enter your name!',true);return;}
  if(!bid||bid<=0){toast('Enter a valid bid amount!',true);return;}
  const c=S.chits.find(c=>c.id==gid);if(!c){toast('Group not found',true);return;}
  const bidderKey=normalizeEmail(currentUser&&currentUser.email?currentUser.email:'')||`member_${name.toLowerCase().replace(/\s+/g,'_')}`;
  const bidObj={id:`${gid}_${bidderKey}`,name,gid:String(gid),groupName:c.name,amount:bid,time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),bidderKey};
  document.getElementById('mem_bid').value='';
  upsertSharedLiveBid(bidObj).then(()=>{
    toast(`Bid of ${fmt(bid)} placed!`);
  }).catch(err=>{
    console.error(err);
    toast('Could not place live bid online.',true);
  });
  queueCloudSave();
}

function renderBids(){
  const bids=[...S.liveBids].sort((a,b)=>b.amount-a.amount);
  const highest=bids[0]||null;

  // â”€â”€ Member view â”€â”€
  const memEl=document.getElementById('mem_bids_list');
  const memBanner=document.getElementById('mem_lowest_banner');
  if(memEl){
    if(!bids.length){
      memEl.innerHTML='<div class="empty"><div class="empty-icon">ðŸ”¨</div><p>No bids placed yet.</p></div>';
      if(memBanner) memBanner.style.display='none';
    } else {
      if(memBanner){
        memBanner.style.display='flex';
        document.getElementById('mem_lowest_val').textContent=fmt(highest.amount);
        document.getElementById('mem_lowest_name').textContent=highest.name;
      }
      memEl.innerHTML=bids.map((b,i)=>`
        <div class="bid-row${i===0?' lowest':''}">
          <div class="bid-rank">${i+1}</div>
          <div style="flex:1;min-width:0;">
            <div class="bid-name">${b.name}${i===0?' <span class="bid-winner-tag">Highest</span>':''}${b.byForeman?' <span style="font-size:9px;color:var(--blue);background:rgba(79,156,249,.1);border:1px solid rgba(79,156,249,.2);border-radius:4px;padding:2px 5px;">Foreman</span>':''}</div>
            <div class="bid-grp">${b.groupName} Â· ${b.time}</div>
          </div>
          <div class="bid-amt">${fmt(b.amount)}</div>
        </div>`).join('');
    }
  }

  // â”€â”€ Foreman view â”€â”€
  const fmEl=document.getElementById('foreman_bids_list');
  const cntEl=document.getElementById('auc_bid_count');
  if(cntEl) cntEl.textContent=bids.length+' bid'+(bids.length===1?'':'s');
  if(fmEl){
    if(!bids.length){
      fmEl.innerHTML='<div class="empty"><div class="empty-icon">ðŸ”¨</div><p>No bids yet. Members can place bids from the Auction tab.</p></div>';
    } else {
      fmEl.innerHTML=bids.map((b,i)=>`
        <div class="bid-row${i===0?' lowest':''}">
          <div class="bid-rank">${i+1}</div>
          <div style="flex:1;min-width:0;">
            <div class="bid-name">${b.name}${i===0?' <span class="bid-winner-tag">Highest â€” Winner</span>':''}${b.byForeman?' <span style="font-size:9px;background:rgba(79,156,249,.12);color:var(--blue);border:1px solid rgba(79,156,249,.25);border-radius:4px;padding:2px 5px;letter-spacing:.3px;">Foreman</span>':''}</div>
            <div class="bid-grp">${b.groupName} Â· ${b.time}</div>
          </div>
          <div class="bid-amt">${fmt(b.amount)}</div>
          ${i===0?`<button class="btn btn-gold btn-sm" onclick="closeAuctionWithWinner(${b.id})" style="white-space:nowrap;">âœ“ Declare</button>`:''}
        </div>`).join('');
    }
  }
}

/* â”€â”€ DASHBOARD â”€â”€ */
function updateDB(){
  const tv=S.chits.reduce((a,c)=>a+c.value,0);
  const tm=S.chits.reduce((a,c)=>a+c.value/c.members,0);
  const te=S.chits.reduce((a,c)=>a+(c.comm/100)*c.value,0);
  document.getElementById('d_tv').textContent=fmt(tv);
  document.getElementById('d_cc').textContent=S.chits.length+' active fund(s)';
  document.getElementById('d_mem').textContent=S.members.length;
  document.getElementById('d_mo').textContent=fmt(tm);
  document.getElementById('d_earn').textContent=fmt(te);
  document.getElementById('d_chitList').innerHTML=S.chits.length?S.chits.map(c=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--ln);"><div><div style="font-weight:600;font-size:13px;color:var(--t1);">${c.name}</div><div style="font-size:11px;color:var(--t3);font-family:'IBM Plex Mono',monospace;">${fmt(c.value)} Â· ${c.members} members</div></div><span class="badge bg">Active</span></div>`).join(''):'<div class="empty"><div class="empty-icon">ðŸ’¼</div><p>No chit funds yet.</p></div>';
  document.getElementById('d_prog').innerHTML=S.chits.length?S.chits.map(c=>{const pk=Object.keys(S.payments).filter(k=>k.includes(`_${c.id}_`)&&S.payments[k]);const p=Math.min(100,c.members?pk.length/c.members*100:0);return `<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-bottom:4px;"><span>${c.name}</span><span>${p.toFixed(0)}%</span></div><div class="pb-track"><div class="pb-fill pb-teal" style="width:${p}%"></div></div></div>`;}).join(''):'<div class="empty"><div class="empty-icon">ðŸ“Š</div><p>No funds to track.</p></div>';
  const ap=Object.values(S.payments).filter(Boolean).length;
  document.getElementById('qs_paid').textContent=ap;
  document.getElementById('qs_due').textContent=Math.max(0,S.members.length-ap);
  document.getElementById('qs_auc').textContent=S.auctions.length;
  document.getElementById('qs_prz').textContent=S.members.filter(m=>m.prized).length;
}
function addAct(text,color){
  const el=document.getElementById('d_act');
  const d=document.createElement('div');d.className='notif-item';
  d.innerHTML=`<div class="ndot-sm" style="background:var(--${color})"></div><div><div class="notif-text">${text}</div><div class="notif-time">Just now</div></div>`;
  el.insertBefore(d,el.firstChild);if(el.children.length>6)el.removeChild(el.lastChild);
}

/* â”€â”€ MY CHIT FUNDS â”€â”€ */
let mcf_del_pending=null;

function openMCFModal(id){
  document.getElementById('mcf_edit_id').value='';
  document.getElementById('mcf_name').value='';
  document.getElementById('mcf_value').value='';
  document.getElementById('mcf_members').value='';
  document.getElementById('mcf_duration').value='';
  document.getElementById('mcf_comm').value='5';
  document.getElementById('mcf_start').value='';
  document.getElementById('mcf_paid').value='0';
  document.getElementById('mcf_foreman').value='';
  document.getElementById('mcf_notes').value='';
  document.getElementById('mcfModalTitle').textContent='Add Chit Fund';
  if(id){
    const f=S.myChitFunds.find(x=>x.id===id);if(!f)return;
    document.getElementById('mcf_edit_id').value=id;
    document.getElementById('mcf_name').value=f.name;
    document.getElementById('mcf_value').value=f.value;
    document.getElementById('mcf_members').value=f.members;
    document.getElementById('mcf_duration').value=f.duration;
    document.getElementById('mcf_comm').value=f.comm;
    document.getElementById('mcf_start').value=f.start||'';
    document.getElementById('mcf_paid').value=f.paid||0;
    document.getElementById('mcf_foreman').value=f.foreman||'';
    document.getElementById('mcf_notes').value=f.notes||'';
    document.getElementById('mcfModalTitle').textContent='Edit Chit Fund';
  }
  openModal('mcfModal');
}

function saveMCF(){
  const name=document.getElementById('mcf_name').value.trim();
  const value=parseFloat(document.getElementById('mcf_value').value)||0;
  const members=parseInt(document.getElementById('mcf_members').value)||0;
  const duration=parseInt(document.getElementById('mcf_duration').value)||0;
  const comm=parseFloat(document.getElementById('mcf_comm').value)||5;
  const start=document.getElementById('mcf_start').value;
  const paid=parseInt(document.getElementById('mcf_paid').value)||0;
  const foreman=document.getElementById('mcf_foreman').value.trim();
  const notes=document.getElementById('mcf_notes').value.trim();
  if(!name||!value||!members||!duration){toast('Fund name, value, members and duration are required!',true);return;}
  const editId=document.getElementById('mcf_edit_id').value;
  if(editId){
    const idx=S.myChitFunds.findIndex(x=>x.id==editId);
    if(idx>-1) S.myChitFunds[idx]={...S.myChitFunds[idx],name,value,members,duration,comm,start,paid,foreman,notes};
    toast(`"${name}" updated!`);
  } else {
    S.myChitFunds.push({id:Date.now(),name,value,members,duration,comm,start,paid,foreman,notes,created:new Date().toLocaleDateString('en-IN')});
    toast(`"${name}" added!`);
  }
  closeModal('mcfModal');popDrops();renderMyChits();
  queueCloudSave();
}

function deleteMCF(id){
  const f=S.myChitFunds.find(x=>x.id===id);if(!f)return;
  mcf_del_pending=id;
  document.getElementById('mcf_del_name').textContent=`"${f.name}"`;
  openModal('mcfDeleteModal');
}

function confirmDeleteMCF(){
  if(!mcf_del_pending)return;
  const gid='m_'+mcf_del_pending;
  S.myChitFunds=S.myChitFunds.filter(x=>x.id!==mcf_del_pending);
  S.memberPayments=S.memberPayments.filter(p=>p.gid!==gid);
  mcf_del_pending=null;
  closeModal('mcfDeleteModal');
  popDrops();renderMyChits();renderMPay();
  toast('Fund removed.');
  queueCloudSave();
}

function renderMyChits(){
  const funds=getVisibleMemberFunds();
  const totalVal=funds.reduce((a,f)=>a+f.value,0);
  const totalMo=funds.reduce((a,f)=>a+(f.value/f.members),0);
  document.getElementById('mcf_total').textContent=fmt(totalVal);
  document.getElementById('mcf_count_lbl').textContent=funds.length+' fund'+(funds.length===1?'':'s');
  document.getElementById('mcf_monthly').textContent=fmt(totalMo);
  const el=document.getElementById('mcf_list');
  if(!funds.length){
    const email=getCurrentUserEmail();
    el.innerHTML=`<div class="empty"><div class="empty-icon">ðŸ¦</div><p>No chit funds are linked yet.${email?'<br>Add this email to a member record: <strong>'+email+'</strong>':''}</p></div>`;
    return;
  }
  el.innerHTML=funds.map(f=>{
    const monthly=f.value/f.members;
    const paidRecords=S.memberPayments.filter(p=>p.gid===f.key);
    const paidCount=Math.min(Math.max(f.paid||0,paidRecords.length),f.duration);
    const pct=f.duration?Math.round(paidCount/f.duration*100):0;
    const remaining=f.duration-paidCount;
    const totalPaid=paidRecords.reduce((a,p)=>a+p.amount,0);
    const barColor=pct>=75?'var(--green)':pct>=40?'var(--teal)':'var(--gold2)';
    const sourceMeta=f.source==='assigned'
      ?`${f.members} members Â· ${f.duration} months Â· ${f.comm}% comm${f.memberTicket?' Â· Ticket #'+f.memberTicket:''}${f.foremanName?' Â· Foreman '+f.foremanName:''}`
      :`${f.members} members Â· ${f.duration} months Â· ${f.comm}% comm${f.foremanName?' Â· '+f.foremanName:''}`;
    const sourceBadge=f.source==='assigned'
      ?'<span class="badge bb">Assigned</span>'
      :'<span class="badge bg">My Fund</span>';
    return `<div class="mcf-card">
      <div class="mcf-top">
        <div class="mcf-icon">ðŸ›</div>
        <div class="mcf-info">
          <div class="mcf-name">${f.name}</div>
          <div class="mcf-meta">${sourceMeta}</div>
        </div>
        <div class="mcf-actions">
          ${sourceBadge}
          ${f.source==='personal'?`<button class="btn btn-icon btn-sm" title="Edit" onclick="openMCFModal(${f.id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-icon btn-sm" title="Remove" onclick="deleteMCF(${f.id})" style="color:var(--red);border-color:rgba(232,85,85,.2);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>`:'<span class="admin-pill free">Read Only</span>'}
        </div>
      </div>
      <div class="mcf-row">
        <div class="mcf-stat"><div class="mcf-stat-val">${fmt(f.value)}</div><div class="mcf-stat-lbl">Chit Value</div></div>
        <div class="mcf-stat"><div class="mcf-stat-val">${fmt(monthly)}</div><div class="mcf-stat-lbl">Monthly</div></div>
        <div class="mcf-stat"><div class="mcf-stat-val" style="color:var(--teal);">${fmt(totalPaid)}</div><div class="mcf-stat-lbl">Paid So Far</div></div>
      </div>
      <div class="mcf-prog-row">
        <div style="font-size:10px;color:var(--t3);white-space:nowrap;">Month ${paidCount}/${f.duration}</div>
        <div class="pb-track" style="flex:1;"><div class="pb-fill" style="width:${pct}%;background:${barColor};"></div></div>
        <div class="mcf-pct">${pct}%</div>
      </div>
      <div style="font-size:10px;color:var(--t4);font-family:'IBM Plex Mono',monospace;margin-top:4px;">${remaining>0?remaining+' month(s) remaining':'âœ… Chit completed!'}${f.start?' Â· Started '+f.start:''}</div>
      ${f.notes?`<div class="mcf-note">${f.notes}</div>`:''}
    </div>`;
  }).join('');
}

/* â”€â”€ INIT â”€â”€ */
(function(){
  const today=new Date();
  const ym=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('cm_start').value=ym;
  loadAccessRegistry();
  updateAuthUI(null);
  syncAdminPortalUI();
  popDrops();
  renderMembers();
  renderPayTable();
  renderAucHist();
  renderMPay();
  renderBids();
  renderMyChits();
  renderMN();
  updateDB();
  initializeFirebase();
})();

