
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PitcheraGameController, PITCHERA_COMMANDS } from "../engine/adapter.js";

const root=resolve(fileURLToPath(new URL("../content/",import.meta.url)));
const get=async name=>JSON.parse(await readFile(resolve(root,name),"utf8"));
const unwrap=x=>x?.records??x?.boards??x?.items??x;
async function content(){
 const [config,manifest,reconstructionPolicy,boards,players,sponsors,staff,targets,dna,finalScoring,positions,rarity,trainingLevels,healing,injuries,blunders,projects,sabotages,training,upgrades,wildcards]=await Promise.all([
  get("game_config.json"),get("content_manifest.json"),get("reconstruction_policy.json"),get("manager_boards.json"),get("players.json"),get("sponsors.json"),get("staff.json"),get("transfer_targets.json"),get("rules/dna_scoring.json"),get("rules/final_scoring.json"),get("rules/positions.json"),get("rules/rarity.json"),get("rules/training_levels.json"),get("events/healing.json"),get("events/injuries.json"),get("events/leadership_blunders.json"),get("events/projects.json"),get("events/sabotages.json"),get("events/training.json"),get("events/upgrades.json"),get("events/wildcards.json")
 ]);
 return {config,manifest,reconstructionPolicy,boards:unwrap(boards),players:unwrap(players),sponsors:unwrap(sponsors),staff:unwrap(staff),targets:unwrap(targets),dna,finalScoring,positions,rarity,trainingLevels,events:{healing:unwrap(healing),injuries:unwrap(injuries),blunders:unwrap(blunders),leadershipBlunders:unwrap(blunders),projects:unwrap(projects),sabotages:unwrap(sabotages),training:unwrap(training),upgrades:unwrap(upgrades),wildcards:unwrap(wildcards)}};
}
test("explicit command contract",()=>{assert.ok(PITCHERA_COMMANDS.includes("startAuction"));assert.ok(PITCHERA_COMMANDS.includes("playEvent"));});
test("controller creates and starts real state",async()=>{const c=new PitcheraGameController({idFactory:()=>"test"});c.initWithContent(await content());c.createLocalGame(["A","B","C","D"]);assert.equal(c.getState().day,"setup");c.dispatch("start");assert.equal(c.getState().day,"saturday");assert.equal(c.getState().playerCount,4);});
test("unknown command cannot mutate",async()=>{const c=new PitcheraGameController({idFactory:()=>"test"});c.initWithContent(await content());c.createLocalGame(["A","B","C","D"]);assert.throws(()=>c.dispatch("nope"));assert.equal(c.getState().day,"setup");});
