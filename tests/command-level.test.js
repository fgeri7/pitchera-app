
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PitcheraGameController } from "../engine/adapter.js";

const root=resolve(fileURLToPath(new URL("../content/",import.meta.url)));
const get=async n=>JSON.parse(await readFile(resolve(root,n),"utf8"));
const unwrap=x=>x?.records??x?.boards??x?.items??x;

async function content(){
 const names=["game_config.json","content_manifest.json","reconstruction_policy.json","manager_boards.json","players.json","sponsors.json","staff.json","transfer_targets.json","rules/dna_scoring.json","rules/final_scoring.json","rules/positions.json","rules/rarity.json","rules/training_levels.json","events/healing.json","events/injuries.json","events/leadership_blunders.json","events/projects.json","events/sabotages.json","events/training.json","events/upgrades.json","events/wildcards.json"];
 const x=Object.fromEntries(await Promise.all(names.map(async n=>[n,await get(n)])));
 return {config:x["game_config.json"],manifest:x["content_manifest.json"],reconstructionPolicy:x["reconstruction_policy.json"],boards:unwrap(x["manager_boards.json"]),players:unwrap(x["players.json"]),sponsors:unwrap(x["sponsors.json"]),staff:unwrap(x["staff.json"]),targets:unwrap(x["transfer_targets.json"]),dna:x["rules/dna_scoring.json"],finalScoring:x["rules/final_scoring.json"],positions:x["rules/positions.json"],rarity:x["rules/rarity.json"],trainingLevels:x["rules/training_levels.json"],events:{healing:unwrap(x["events/healing.json"]),injuries:unwrap(x["events/injuries.json"]),blunders:unwrap(x["events/leadership_blunders.json"]),leadershipBlunders:unwrap(x["events/leadership_blunders.json"]),projects:unwrap(x["events/projects.json"]),sabotages:unwrap(x["events/sabotages.json"]),training:unwrap(x["events/training.json"]),upgrades:unwrap(x["events/upgrades.json"]),wildcards:unwrap(x["events/wildcards.json"])}};
}
async function make(){
 const c=new PitcheraGameController({idFactory:()=>crypto.randomUUID()});
 c.initWithContent(await content());
 c.createLocalGame(["A","B","C","D"]); c.dispatch("start");
 return c;
}
function manager(c,id="manager_1"){return c.getState().managers.find(m=>m.id===id)}
function expectRule(fn,code){
 try{fn();assert.fail("Expected rule error "+code)}
 catch(e){assert.equal(e.code,code,`Expected ${code}, got ${e.code}: ${e.message}`)}
}

test("auction rejects insufficient cash and low bids without corrupting state",async()=>{
 const c=await make(); const s=c.getState(); const p=s.playerDeck.at(-1);
 c.dispatch("startAuction",{playerIds:[p.id, ...c.getState().playerDeck.slice(-3,-1).map(x=>x.id)]});
 const before=structuredClone(s.auction);
 expectRule(()=>c.dispatch("bid",{managerId:"manager_1",playerId:p.id,amount:999999}),"INSUFFICIENT_CASH");
 assert.deepEqual(s.auction,before);
 const rarity=c.content.rarity.rarities.find(r=>r.id===p.rarity);
 expectRule(()=>c.dispatch("bid",{managerId:"manager_1",playerId:p.id,amount:Math.max(0,rarity.baseAuctionPrice-1)}),"BID_TOO_LOW");
 assert.deepEqual(s.auction,before);
});

test("auction rejects duplicate bid on same player",async()=>{
 const c=await make(); const p=c.getState().playerDeck.at(-1);
 c.dispatch("startAuction",{playerIds:[p.id, ...c.getState().playerDeck.slice(-3,-1).map(x=>x.id)]});
 const price=c.content.rarity.rarities.find(r=>r.id===p.rarity).baseAuctionPrice;
 c.dispatch("bid",{managerId:"manager_1",playerId:p.id,amount:price});
 expectRule(()=>c.dispatch("bid",{managerId:"manager_1",playerId:p.id,amount:price+100}),"ALREADY_BID_PLAYER");
});

test("auction resolution transfers winner and charges commitment",async()=>{
 const c=await make(); const p=c.getState().playerDeck.at(-1);
 c.dispatch("startAuction",{playerIds:[p.id, ...c.getState().playerDeck.slice(-3,-1).map(x=>x.id)]});
 const price=c.content.rarity.rarities.find(r=>r.id===p.rarity).baseAuctionPrice;
 const cash=manager(c).cash;
 c.dispatch("bid",{managerId:"manager_1",playerId:p.id,amount:price});
 c.dispatch("resolveAuction");
 const m=manager(c); assert.ok(m.availablePlayers.some(x=>x.card.id===p.id));
 assert.equal(m.cash,cash-price);
});

test("player seating respects locker capacity",async()=>{
 const c=await make(); const s=c.getState(); const m=manager(c);
 const ids=s.playerDeck.slice(-5).map(p=>p.id);
 // Inject five owned cards through the same public command path used after auctions.
 for(const id of ids.slice(0,4)){m.availablePlayers.push({card:structuredClone(s.content.players.find(p=>p.id===id)),injuryId:null});c.dispatch("seatPlayer",{managerId:m.id,playerId:id});}
 assert.equal(m.lockerRoom.length,4);
 const fifth=ids[4]; m.availablePlayers.push({card:structuredClone(s.content.players.find(p=>p.id===fifth)),injuryId:null});
 expectRule(()=>c.dispatch("seatPlayer",{managerId:m.id,playerId:fifth}),"LOCKER_FULL");
});

test("activities apply their intended resource changes",async()=>{
 const c=await make(); const m=manager(c);
 const cash=m.cash, training=m.trainingLevel;
 c.dispatch("chooseActivity",{managerId:m.id,activity:"intense_gym"});
 assert.equal(m.trainingLevel,training+1);
 c.dispatch("chooseActivity",{managerId:m.id,activity:"friendly_match"});
 assert.equal(m.trainingLevel,training+3);
 assert.equal(m.cash,cash-100);
});

test("Monday deal creates three event cards per manager",async()=>{
 const c=await make(); c.dispatch("nextDay"); c.dispatch("nextDay");
 assert.equal(c.getState().day,"monday");
 for(const m of c.getState().managers) assert.equal(m.mondayDraw.length,3);
});

test("manager board status is exposed and illegal action is rejected",async()=>{
 const c=await make(); const m=manager(c);
 const status=c.dispatch("getBoardPerkStatus",{managerId:m.id});
 assert.ok(status);
 const boardActions = {
  scouting_department:"definitely_invalid",
  tactical_director:"definitely_invalid",
  youth_development_office:"definitely_invalid",
  veteran_network:"definitely_invalid"
};
expectRule(()=>c.dispatch("useManagerBoard",{managerId:m.id,action:boardActions[m.managerBoard?.perk?.id] ?? "definitely_invalid"}),"INVALID_BOARD_ACTION");
});

test("staff ability status is exposed",async()=>{
 const c=await make(); const m=manager(c);
 const status=c.dispatch("getStaffAbilityStatus",{managerId:m.id});
 assert.ok(status);
});

test("sponsor task evaluation is non-mutating",async()=>{
 const c=await make(); const m=manager(c);
 const before=structuredClone(m);
 const result=c.dispatch("evaluateSponsorTask",{managerId:m.id,week:1});
 assert.ok(result && typeof result.available==="boolean");
 assert.deepEqual(manager(c),before);
});

test("training trophy only resolves in its allowed phase",async()=>{
 const c=await make();
 expectRule(()=>c.dispatch("resolveTrainingTrophy"),"WRONG_PHASE");
});

test("final scoring returns a finite result",async()=>{
 const c=await make(); c.dispatch("nextDay"); // state remains coherent even before a full match
 c.getState().day="final_scoring";
 for(const m of c.getState().managers){
   const result=c.dispatch("calculateFinalScore",{managerId:m.id});
   assert.ok(Number.isFinite(result.total ?? result.score ?? result));
 }
});

test("read-only commands do not emit a mutation commit",async()=>{
 const c=await make(); let emissions=0; c.subscribe(()=>emissions++);
 c.dispatch("getState"); c.dispatch("getCurrentManager",{});
 assert.equal(emissions,0);
});
