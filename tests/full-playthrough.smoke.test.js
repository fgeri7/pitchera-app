
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PitcheraGameController } from "../engine/adapter.js";

const root=resolve(fileURLToPath(new URL("../content/",import.meta.url)));
const get=async name=>JSON.parse(await readFile(resolve(root,name),"utf8"));
const unwrap=x=>x?.records??x?.boards??x?.items??x;

async function loadFixture(){
  const names=[
    "game_config.json","content_manifest.json","reconstruction_policy.json",
    "manager_boards.json","players.json","sponsors.json","staff.json","transfer_targets.json",
    "rules/dna_scoring.json","rules/final_scoring.json","rules/positions.json",
    "rules/rarity.json","rules/training_levels.json",
    "events/healing.json","events/injuries.json","events/leadership_blunders.json",
    "events/projects.json","events/sabotages.json","events/training.json",
    "events/upgrades.json","events/wildcards.json"
  ];
  const x=Object.fromEntries(await Promise.all(names.map(async n=>[n,await get(n)])));
  return {
    config:x["game_config.json"], manifest:x["content_manifest.json"],
    reconstructionPolicy:x["reconstruction_policy.json"],
    boards:unwrap(x["manager_boards.json"]), players:unwrap(x["players.json"]),
    sponsors:unwrap(x["sponsors.json"]), staff:unwrap(x["staff.json"]),
    targets:unwrap(x["transfer_targets.json"]),
    dna:x["rules/dna_scoring.json"], finalScoring:x["rules/final_scoring.json"],
    positions:x["rules/positions.json"], rarity:x["rules/rarity.json"],
    trainingLevels:x["rules/training_levels.json"],
    events:{
      healing:unwrap(x["events/healing.json"]), injuries:unwrap(x["events/injuries.json"]),
      blunders:unwrap(x["events/leadership_blunders.json"]),
      leadershipBlunders:unwrap(x["events/leadership_blunders.json"]),
      projects:unwrap(x["events/projects.json"]), sabotages:unwrap(x["events/sabotages.json"]),
      training:unwrap(x["events/training.json"]), upgrades:unwrap(x["events/upgrades.json"]),
      wildcards:unwrap(x["events/wildcards.json"])
    }
  };
}

test("PITCHERA completes a 4-week local engine playthrough", async () => {
  const content=await loadFixture();
  const controller=new PitcheraGameController({
    idFactory:()=> "smoke-game",
    rng: (()=>{let s=123456; return ()=>{s=(1664525*s+1013904223)>>>0; return s/4294967296;};})()
  });
  controller.initWithContent(content);
  controller.createLocalGame(["Manager 1","Manager 2","Manager 3","Manager 4"]);
  controller.dispatch("start");
  assert.equal(controller.getState().day,"saturday");

  for(let week=1;week<=4;week++){
    const state=controller.getState();
    assert.equal(state.week,week);
    assert.equal(state.day,"saturday");

    // A valid 3-card auction: each of the first three managers commits
    // one different player at that card's minimum price.
    const market=state.playerDeck.slice(-3);
    controller.dispatch("startAuction",{playerIds:market.map(p=>p.id)});
    for(let i=0;i<3;i++){
      const player=market[i];
      const rarity=content.rarity.rarities.find(r=>r.id===player.rarity);
      controller.dispatch("bid",{
        managerId:`manager_${i+1}`,
        playerId:player.id,
        amount:rarity.baseAuctionPrice
      });
    }
    controller.dispatch("resolveAuction");

    // Seat every auction winner.
    for(const m of controller.getState().managers){
      const pending=m.availablePlayers?.[0];
      if(pending) controller.dispatch("seatPlayer",{managerId:m.id,playerId:pending.card.id});
      controller.dispatch("chooseActivity",{managerId:m.id,activity:"intense_gym"});
    }

    // Saturday -> Sunday -> Monday; Monday deal is automatic.
    controller.dispatch("nextDay");
    assert.equal(controller.getState().day,"sunday");
    controller.dispatch("nextDay");
    assert.equal(controller.getState().day,"monday");
    for(const m of controller.getState().managers){
      assert.equal(m.mondayDraw.length,3);
    }

    // Tuesday/Wednesday/Thursday. No optional event is required for a smoke run.
    controller.dispatch("nextDay");
    assert.equal(controller.getState().day,"tuesday");
    controller.dispatch("nextDay");
    assert.equal(controller.getState().day,"wednesday");
    controller.dispatch("nextDay");
    assert.equal(controller.getState().day,"thursday");
    controller.dispatch("resolveTrainingTrophy");

    // Friday.
    controller.dispatch("nextDay");
    assert.equal(controller.getState().day,"friday");
    controller.dispatch("payday");

    // Finish week. Week 4 moves to deadline instead of another Saturday.
    controller.dispatch("finishWeek");
    if(week<4) assert.equal(controller.getState().day,"saturday");
    else assert.equal(controller.getState().day,"deadline");
  }

  controller.dispatch("nextDay");
  assert.equal(controller.getState().day,"final_scoring");

  const scores=controller.getState().managers.map(m=>
    controller.dispatch("calculateFinalScore",{managerId:m.id})
  );
  assert.equal(scores.length,4);
  assert.ok(scores.every(s=>Number.isFinite(s.total ?? s.score ?? s)));
});
