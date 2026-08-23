
import { PitcheraGameController } from "./engine/adapter.js";

const root=document.querySelector("#app");
const NAMES=["Manager 1","Manager 2","Manager 3","Manager 4"];
let game=null, errorMsg="";

const money=n=>`$${Number(n??0).toLocaleString("en-US")}`;
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function state(){return game?.getState();}
function manager(id){return state()?.managers?.find(m=>m.id===id);}
function dispatch(cmd,payload={}){
  try{ errorMsg=""; game.dispatch(cmd,payload); render(); }
  catch(e){ errorMsg=e?.message||String(e); render(); }
}

function boot(){
  root.innerHTML=`<div class="start-screen">
    <div class="start-card">
      <div class="brand"><img src="assets/icon-96.png"><div><b>PITCHERA</b><small>BUILD • BID • WIN</small></div></div>
      <p class="kicker">STRATEGIC FOOTBALL MANAGEMENT</p>
      <h1>Build your squad.<br><span>Bid smart. Win.</span></h1>
      <p class="intro">Local 4-manager prototype powered by the PITCHERA Rules Engine.</p>
      <div class="name-grid">${NAMES.map((n,i)=>`<label>MANAGER ${i+1}<input id="n${i}" value="${n}" maxlength="18"></label>`).join("")}</div>
      <button class="gold-btn" id="newGame">START LOCAL GAME</button>
      <p class="hint">Landscape mode recommended.</p>
    </div>
  </div>`;
  document.querySelector("#newGame").onclick=async()=>{
    const names=NAMES.map((_,i)=>document.querySelector("#n"+i).value.trim()||`Manager ${i+1}`);
    game=new PitcheraGameController();
    try{await game.init();game.createLocalGame(names);dispatch("start");}
    catch(e){errorMsg=e.message;bootError()}
  };
}
function bootError(){
  root.querySelector(".start-card").insertAdjacentHTML("beforeend",`<div class="error">${esc(errorMsg)}</div>`);
}

function render(){
  const s=state();
  if(!s){boot();return}
  const current=s.currentManagerId;
  const cm=manager(current);
  const auction=s.auction||{};
  const market=auction.players||[];
  root.innerHTML=`<div class="app-shell">
    <header class="topbar">
      <div class="brand mini"><img src="assets/icon-96.png"><div><b>PITCHERA</b><small>BUILD • BID • WIN</small></div></div>
      <div class="status">
        <span class="week">WEEK ${s.week??1}</span>
        <span>${esc(String(s.day).toUpperCase())}</span>
        <span class="pill">${esc(String(s.phase??"GAME").toUpperCase())}</span>
      </div>
      <button class="ghost" id="reset">NEW GAME</button>
    </header>
    ${errorMsg?`<div class="toast error">${esc(errorMsg)}</div>`:""}
    <main class="layout">
      <aside class="managers">
        <div class="section-title">MANAGERS <span>4</span></div>
        ${s.managers.map((m,i)=>`<button class="manager ${m.id===current?"selected":""}" data-m="${m.id}">
          <div class="avatar">${i+1}</div><div class="mtext"><b>${esc(m.name)}</b><small>${esc(m.managerBoard?.name||"Manager")}</small></div>
          <strong>${money(m.cash)}</strong>
          <div class="mstats"><span>TR ${m.trainingLevel??0}</span><span>${m.lockerRoom?.length??0}/4 PLAYERS</span></div>
        </button>`).join("")}
      </aside>
      <section class="main">
        <section class="hero">
          <div><span class="eyebrow">CURRENT MANAGER</span><h1>${esc(cm?.name||"PITCHERA")}</h1><p>${esc(cm?.managerBoard?.name||"Manager Board")}</p></div>
          <div class="hero-stats"><div><small>CASH</small><b>${money(cm?.cash)}</b></div><div><small>TRAINING</small><b>${cm?.trainingLevel??0}</b></div><div><small>ROSTER</small><b>${cm?.lockerRoom?.length??0}/4</b></div></div>
        </section>
        <section class="content-grid">
          <article class="panel market-panel">
            <div class="panel-head"><div><span class="eyebrow">LIVE MARKET</span><h2>${auction.status==="open"?"AUCTION OPEN":"SATURDAY MARKET"}</h2></div><span class="state-dot ${auction.status==="open"?"on":""}"></span></div>
            ${auction.status==="open" ? auctionView(s,cm) : marketIdle(s)}
          </article>
          <article class="panel roster-panel">
            <div class="panel-head"><div><span class="eyebrow">LOCKER ROOM</span><h2>YOUR SQUAD</h2></div><span>${cm?.lockerRoom?.length??0}/4</span></div>
            ${rosterView(cm)}
          </article>
          <article class="panel action-panel">
            <div class="panel-head"><div><span class="eyebrow">GAME CONTROL</span><h2>QUICK ACTIONS</h2></div></div>
            <div class="actions">
              <button data-action="nextDay">NEXT DAY <span>→</span></button>
              <button data-action="activity">INTENSE GYM <span>+1 TR</span></button>
              <button data-action="event">OPEN EVENT <span>◆</span></button>
              <button data-action="board">BOARD PERK <span>◇</span></button>
            </div>
          </article>
          <article class="panel log-panel">
            <div class="panel-head"><div><span class="eyebrow">MATCH LOG</span><h2>ACTIVITY</h2></div></div>
            <div class="log">${(s.log||[]).slice(-7).reverse().map(x=>`<div>${esc(typeof x==="string"?x:(x.type||"Game action"))}</div>`).join("")||"<div>Game ready.</div>"}</div>
          </article>
        </section>
      </section>
    </main>
  </div>`;
  bind();
}

function marketIdle(s){
 return `<div class="market-empty"><div class="ball">⚽</div><h3>Open the Saturday market</h3><p>Three player cards enter the auction.</p><button class="gold-btn small" id="openAuction">OPEN AUCTION</button></div>`;
}
function auctionView(s,cm){
 const a=s.auction;
 return `<div class="auction-grid">${a.players.map(p=>{
   const r=s.content?.rarity?.rarities?.find(x=>x.id===p.rarity);
   const my=a.bids?.[p.id]?.managerId===cm.id;
   return `<div class="player-card ${my?"mine":""}"><div class="rating">${p.rating??"—"}</div><div><b>${esc(p.name)}</b><small>${esc(p.position||"") } · ${esc(p.rarity||"")}</small></div><div class="price">${money(a.bids?.[p.id]?.amount??r?.baseAuctionPrice??0)}</div><button data-bid="${p.id}">${my?"BID PLACED":"BID"}</button></div>`;
 }).join("")}</div>`;
}
function rosterView(m){
 if(!m?.lockerRoom?.length)return `<div class="empty">No players yet.<br><small>Win an auction to build your squad.</small></div>`;
 return `<div class="roster">${m.lockerRoom.map(p=>`<div class="roster-row"><span class="mini-rating">${p.card?.rating??"—"}</span><div><b>${esc(p.card?.name)}</b><small>${esc(p.card?.position||"")} · ${esc(p.card?.rarity||"")}</small></div></div>`).join("")}</div>`;
}

function bind(){
 document.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{game.state.currentManagerId=b.dataset.m;render()});
 document.querySelector("#reset").onclick=()=>{game=null;errorMsg="";boot()};
 const open=document.querySelector("#openAuction");
 if(open)open.onclick=()=>{const ids=state().playerDeck.slice(-3).map(p=>p.id);dispatch("startAuction",{playerIds:ids})};
 document.querySelectorAll("[data-bid]").forEach(b=>b.onclick=()=>{
   const p=state().auction.players.find(x=>x.id===b.dataset.bid);
   const r=state().content.rarity.rarities.find(x=>x.id===p.rarity);
   dispatch("bid",{managerId:state().currentManagerId,playerId:p.id,amount:r.baseAuctionPrice});
 });
 document.querySelector("[data-action=nextDay]").onclick=()=>dispatch("nextDay");
 document.querySelector("[data-action=activity]").onclick=()=>dispatch("chooseActivity",{managerId:state().currentManagerId,activity:"intense_gym"});
 document.querySelector("[data-action=event]").onclick=()=>dispatch("playEvent",{managerId:state().currentManagerId});
 document.querySelector("[data-action=board]").onclick=()=>dispatch("getBoardPerkStatus",{managerId:state().currentManagerId});
}
boot();
