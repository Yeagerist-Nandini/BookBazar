-- KEYS[1] = cart_key
-- ARGV[1] = bookId
-- ARGV[2] = updatedAt (timestamp)

--check if cart exists
local cart_exists = redis.call("JSON.GET", KEYS[1])
if not cart_exists then
    return "NO_CART"
end


--check if item exists in cart
local item_path = "$." ..ARGV[1]
local item = redis.call("JSON.GET", KEYS[1], item_path)

if not item then
    return "ITEM_NOT_FOUND"
end


-- calc totalAmount 
local item_obj = cjson.decode(item)
local item_total = (item_obj.price) * (item_obj.quantity)

-- increment version
local current_version = tonumber(redis.call("JSON.GET", KEYS[1], "$.version") or "0")
redis.call("JSON.SET", KEYS[1], "$.version", cjson.encode(current_version + 1)) 
redis.call("JSON.SET", KEYS[1], "$.updatedAt", cjson.encode(ARGV[2]))


--subtract totalAmount
local current_total = tonumber(redis.call("JSON.GET", KEYS[1], "$.totalAmount") or "0")
local new_total = current_total - item_total

if new_total < 0 then new_total = 0 end

redis.call("JSON.SET", KEYS[1], "$.totalAmount", cjson.encode(new_total))

--delete the cart item
redis.call("JSON.DEL", KEYS[1], item_path)

return "SUCCESS"


-- await redisClient.json.del(cart_key, `$.${bookId}`);