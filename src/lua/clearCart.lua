-- KEYS[1] = cart_key
-- ARGV[1] = updatedAt (timestamp)

--1. check if cart exists 
local cart_exists = redis.call("EXISTS", KEYS[1])

if cart_exists == 0 then
    return "NO_CART"
end

-- increment version
local current_version = cjson.decode(redis.call("JSON.GET", KEYS[1], "$.version"))[1]
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
