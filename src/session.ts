import { GameSim } from "./sim/gameSim";

let sim: GameSim | null = null;

export function startSession(seed?: number): GameSim {
  sim = GameSim.create({ seed: seed ?? (Date.now() % 1_000_000), autoSpawn: true });
  return sim;
}

export function getSim(): GameSim {
  if (!sim) throw new Error("Game session has not started");
  return sim;
}
