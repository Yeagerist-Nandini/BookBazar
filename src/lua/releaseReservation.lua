-- ARGV: orderId

local orderId = ARGV[1]
local resvKey = "resv:".. orderId

-- load reservation data (if exists)
local resv_data = redis.get(resvKey)
if not resv_data or resv_data == nil then
    return "NO_RESERVATION"
end

-- parse reservation data and increment stock
local items = cjson.decode(resv_data)

for i,item in ipairs(items) do
    local qty = tonumber(item.qty)
    local stock_key = item.bookId

    if qty > 0 then 
        redis.incrby(stock_key, qty)
    end
end

-- delete reservation 
redis.del(resvKey)

return "DONE"