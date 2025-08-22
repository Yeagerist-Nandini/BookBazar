-- KEYS[1] = cart_key
-- ARGV[1] = updatedAt (timestamp)

--1. check if cart exists 
local cart_exists = redis.call("JSON.GET", KEYS[1])
if not cart_exists then
    return "NO_CART"
end

-- set version to 0
local current_version = tonumber(redis.call("JSON.GET", KEYS[1], "$.version") or "0")
redis.call("JSON.SET", KEYS[1], "$.version", cjson.encode(current_version + 1))

-- set totalAmount to 0
redis.call("JSON.SET",KEYS[1],  "$.totalAmount", cjson.encode(0))

-- update updatedAt
redis.call("JSON.SET", KEYS[1], "$.updatedAt", cjson.encode(ARGV[1]))


-- delete all bookId key
local keys = redis.call("JSON.OBJKEYS", KEYS[1], "$")[1]

for i, k in ipairs(keys) do 
    if k ~= "version" and k ~= "updatedAt" and k ~= "totalAmount" then
        local path = "$." .. k
        redis.call("JSON.DEL", KEYS[1], path)
    end 
end 


return "SUCCESS"
