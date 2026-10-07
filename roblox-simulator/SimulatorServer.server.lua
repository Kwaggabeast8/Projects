-- Put in: ServerScriptService (a normal Script)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")

local BASE_UPGRADE_COST = 50
local COST_GROWTH = 1.5
local COLLECT_COOLDOWN = 0.2
local AUTOSAVE_SECONDS = 60

local store = DataStoreService:GetDataStore("SimulatorData_v1")

local collectEvent = Instance.new("RemoteEvent")
collectEvent.Name = "Collect"
collectEvent.Parent = ReplicatedStorage

local upgradeEvent = Instance.new("RemoteEvent")
upgradeEvent.Name = "BuyUpgrade"
upgradeEvent.Parent = ReplicatedStorage

local lastCollect = {}

local function upgradeCost(level)
	return math.floor(BASE_UPGRADE_COST * COST_GROWTH ^ (level - 1))
end

local function refreshCost(player)
	local level = player.leaderstats.Level.Value
	player:SetAttribute("UpgradeCost", upgradeCost(level))
end

local function save(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats or not player:GetAttribute("Loaded") then
		return -- never overwrite saved data with defaults if loading failed
	end
	local data = { Coins = stats.Coins.Value, Level = stats.Level.Value }
	local ok, err = pcall(function()
		store:SetAsync("Player_" .. player.UserId, data)
	end)
	if not ok then
		warn("Save failed for " .. player.Name .. ": " .. tostring(err))
	end
end

local function load(player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Parent = stats

	local level = Instance.new("IntValue")
	level.Name = "Level"
	level.Value = 1
	level.Parent = stats

	stats.Parent = player

	local ok, data = pcall(function()
		return store:GetAsync("Player_" .. player.UserId)
	end)
	if ok then
		if data then
			coins.Value = data.Coins or 0
			level.Value = math.max(1, data.Level or 1)
		end
		player:SetAttribute("Loaded", true)
	else
		warn("Load failed for " .. player.Name .. ": " .. tostring(data))
	end
	refreshCost(player)
end

Players.PlayerAdded:Connect(load)
for _, player in Players:GetPlayers() do
	task.spawn(load, player)
end

Players.PlayerRemoving:Connect(function(player)
	save(player)
	lastCollect[player] = nil
end)

collectEvent.OnServerEvent:Connect(function(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local now = os.clock()
	if now - (lastCollect[player] or 0) < COLLECT_COOLDOWN then return end
	lastCollect[player] = now
	-- gain per collect equals the upgrade level
	stats.Coins.Value += stats.Level.Value
end)

upgradeEvent.OnServerEvent:Connect(function(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local cost = upgradeCost(stats.Level.Value)
	if stats.Coins.Value >= cost then
		stats.Coins.Value -= cost
		stats.Level.Value += 1
		refreshCost(player)
	end
end)

task.spawn(function()
	while true do
		task.wait(AUTOSAVE_SECONDS)
		for _, player in Players:GetPlayers() do
			save(player)
		end
	end
end)

game:BindToClose(function()
	for _, player in Players:GetPlayers() do
		save(player)
	end
end)
