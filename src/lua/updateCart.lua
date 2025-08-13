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


-- update the cart item 
local path = "$." .. ARGV[1]
redis.call("JSON.SET", KEYS[1], path, cjson.encode({
    quantity = tonumber(ARGV[2]),
    price = tonumber(ARGV[3]),
    title = ARGV[4]
}))

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