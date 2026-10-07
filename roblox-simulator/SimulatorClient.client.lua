-- Put in: StarterPlayer > StarterPlayerScripts (a LocalScript)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local collectEvent = ReplicatedStorage:WaitForChild("Collect")
local upgradeEvent = ReplicatedStorage:WaitForChild("BuyUpgrade")
local stats = player:WaitForChild("leaderstats")
local coins = stats:WaitForChild("Coins")
local level = stats:WaitForChild("Level")

local gui = Instance.new("ScreenGui")
gui.Name = "SimulatorGui"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local function makeButton(name, text, position, color)
	local button = Instance.new("TextButton")
	button.Name = name
	button.Text = text
	button.Size = UDim2.fromOffset(220, 60)
	button.Position = position
	button.AnchorPoint = Vector2.new(0.5, 1)
	button.BackgroundColor3 = color
	button.TextColor3 = Color3.new(1, 1, 1)
	button.TextScaled = true
	button.Font = Enum.Font.GothamBold
	button.Parent = gui
	Instance.new("UICorner").Parent = button
	return button
end

local collectButton = makeButton("Collect", "Collect", UDim2.new(0.5, -120, 1, -20), Color3.fromRGB(46, 160, 67))
local upgradeButton = makeButton("Upgrade", "Upgrade", UDim2.new(0.5, 120, 1, -20), Color3.fromRGB(56, 112, 214))

local function refresh()
	local cost = player:GetAttribute("UpgradeCost") or 0
	collectButton.Text = "Collect (+" .. level.Value .. ")"
	upgradeButton.Text = "Upgrade: " .. cost .. " coins"
	upgradeButton.BackgroundColor3 = coins.Value >= cost and Color3.fromRGB(56, 112, 214) or Color3.fromRGB(90, 90, 90)
end

coins.Changed:Connect(refresh)
level.Changed:Connect(refresh)
player:GetAttributeChangedSignal("UpgradeCost"):Connect(refresh)
refresh()

collectButton.Activated:Connect(function()
	collectEvent:FireServer()
end)

upgradeButton.Activated:Connect(function()
	upgradeEvent:FireServer()
end)
