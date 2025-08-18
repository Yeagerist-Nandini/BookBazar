-- KEYS[1] = cart_key
-- ARGV[1] = bookId
-- ARGV[2] = quantity
-- ARGV[3] = price
-- ARGV[4] = title
-- ARGV[5] = updatedAt (timestamp)

-- check if cart exists
local cart_exists = redis.call("JSON.GET", KEYS[1])
if not cart_exists then
    redis.call("JSON.SET", KEYS[1], "$", cjson.encode({
        version = 1,
        updatedAt = ARGV[5]
    }))
else 
    -- increment version
    local current_version = tonumber(redis.call("JSON.GET", KEYS[1], "$.version") or "0")
    redis.call("JSON.SET", KEYS[1], "$.version", cjson.encode(current_version + 1))
    redis.call("JSON.SET", KEYS[1], "$.updatedAt", cjson.encode(ARGV[5]))
end 


local path = "$." .. ARGV[1]

-- get previous amount if exist
local prev_item = redis.call("JSON.GET", KEYS[1], path)
prev_item = cjson.decode(prev_item)

local prev_item_total = 0

if prev_item then 
    prev_item_total = (prev_item.price or 0) * (prev_item.quantity or 0)
end


-- update the cart item 
redis.call("JSON.SET", KEYS[1], path, cjson.encode({
    quantity = tonumber(ARGV[2]),
    price = tonumber(ARGV[3]),
    title = ARGV[4]
}))

-- update totalAmount
local item_total = tonumber(ARGV[3]) * tonumber(ARGV[2])
local current_total = tonumber(redis.call("JSON.GET", KEYS[1], "$.totalAmount") or "0")
local new_total = current_total - prev_item_total + item_total

redis.call("JSON.SET", KEYS[1], "$.totalAmount", cjson.encode(new_total))


return "UPDATED"





-- //check if redis cart exits
-- const cart = await redisClient.json.get(cart_key);
-- if(!cart){
--     await redisClient.json.set(cart_key, "$", {
--         version: 1,
--         updatedAt: new Date.now()
--     })
-- }

-- // Atomic Update in Redis (Redis Lua Script)
-- await redisClient.json.set(cart_key, `$${bookId}`, {
--     quantity: quantity,
--     price: book.price,
--     title: book.title
-- })