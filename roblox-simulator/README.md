# Roblox Simulator Starter

Click Collect to earn coins, spend coins on upgrades that raise coins per click. Progress saves.

## Install in Studio
1. `SimulatorServer.server.lua`: in ServerScriptService, insert a **Script**, paste the code.
2. `SimulatorClient.client.lua`: in StarterPlayer > StarterPlayerScripts, insert a **LocalScript**, paste the code.
3. To test saving in Studio: Game Settings > Security > turn on **Enable Studio Access to API Services**.
4. Press Play. Coins and Level show in the leaderboard; buttons are at the bottom of the screen.

## Tweak
Edit the constants at the top of the server script: `BASE_UPGRADE_COST`, `COST_GROWTH`, `COLLECT_COOLDOWN`.
