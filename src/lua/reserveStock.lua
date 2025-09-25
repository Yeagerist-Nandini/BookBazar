-- KEYS: stock keys per book
-- ARGV: qty1, qty2, ..., orderId, TTL

local orderId = ARGV[#ARGV]
local ttl = tonumber(ARGV[#ARGV - 1])
local numOfItems = #KEYS
local resvKey = "resv:" .. orderId

-- check stock 
for i=1, numOfItems do 
    local stock = tonumber(redis.get(KEYS[i]))
    local qty = tonumber(ARGV[i])

    if stock == nil or stock < qty then 
        return "INSUFFICIENT_STOCK:"..KEYS[i]
    end 
end

-- deduct stock 
for i=1, numOfItems do 
    local qty = tonumber(ARGV[i])
    redis.decrby(KEYS[i], qty)
end

-- save reservation in redis 
local resvData = {}
for i=1, numOfItems do 
    resvData[i] = { bookId=KEYS[i], qty=ARGV[i] }
end


redis.set(resvKey, cjson.encode(resvData))
redis.call("EXPIRE", resvKey, ttl)

return "DONE"

-- output of redis.json.get => "[{data}]"
-- redis.get => 'data'