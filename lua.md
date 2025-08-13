# LUA

## what is LUA

- Lua is a lightweight, fast, embeddable scripting language.
- Think of it as a mini programming language you can run inside another application.
- It has a simple syntax (similar to JavaScript in feel, but even smaller) and is designed to run very quickly.


## why Lua in Redis 

- Redis supports **EVAL** that lets you run Lua scripts inside Redis

1. ### Atomic multi-step operations
- Without Lua: if you need to do “check X, then update Y, then push to Z”, you must send multiple commands from your app to Redis.
- Problem: between those commands, another client might change the data → race conditions.
- Your whole Lua script runs in one go without other Redis commands interrupting. This avoids race conditions.
- With Lua: you put all that logic in a single script → Redis runs it atomically → no interference.

2. ### Reduce network round-trips (Performance)
- Normally, each Redis command is a separate request over TCP.
- If your logic needs 5 Redis commands, that’s 5 network calls.
- With Lua: you send one EVAL call, which runs all 5 commands internally on the Redis server.
- Huge win in latency-sensitive applications.


3. ### Avoid limitations of MULTI/EXEC
- Redis transactions (MULTI/EXEC) ensure atomicity, but they can’t do conditional logic based on intermediate results without multiple round-trips.
- Lua scripts can make decisions mid-execution (if, for, etc.) and act accordingly — still atomically.


4. ### Custom commands without patching Redis
- You can create new “virtual commands” by writing Lua scripts.
- Example: “Get top 5 scores and increment their counters” → can be written in Lua and stored in Redis like a native command.

5. ### Performance at scale
- Lua is very lightweight compared to embedding Python, JavaScript, etc. in Redis.
- It runs in the same single-threaded event loop without much memory overhead.

## You can think of Lua in Redis kind of like PL/SQL in Oracle

## Use Cases in Redis
1. Atomic Check-Then-Act Logic
2. Multi-Key Updates Without Race Conditions
3. Rate Limiting / Throttling
4. Conditional Deletes / Updates
5. Complex Aggregations
- Example: go through a list, sum certain values, and store the result.
- Instead of fetching all data into your app and processing there, do it inside Redis to avoid transferring large payloads.

6. Create Custom Redis Commands



## **🔹 Lua Basics You Actually Need for Redis**

*(Skip the rest of Lua — you only need these 6 things for 90% of Redis scripts)*

---

### **1. Calling Redis Commands**

```lua
redis.call("COMMAND", arg1, arg2, ...)
```

* **`redis.call`** → runs the command, throws error if command fails.
* **`redis.pcall`** → same, but returns error instead of throwing.

Example:

```lua
local value = redis.call("GET", KEYS[1])
```

---

### **2. Using KEYS and ARGV**

* `KEYS` → list of keys passed from Node.js.
* `ARGV` → list of arguments passed from Node.js.

Example:

```lua
local key = KEYS[1]
local amount = tonumber(ARGV[1])
redis.call("INCRBY", key, amount)
```

---

### **3. Variables & Math**

```lua
local count = tonumber(redis.call("GET", KEYS[1]))
count = count + 1
redis.call("SET", KEYS[1], count)
```

---

### **4. Conditionals**

```lua
if redis.call("EXISTS", KEYS[1]) == 1 then
    return redis.call("GET", KEYS[1])
else
    return "Key not found"
end
```

---

### **5. Loops**

```lua
local sum = 0
for i = 1, #KEYS do
    sum = sum + tonumber(redis.call("GET", KEYS[i]) or 0)
end
return sum
```

---

### **6. Returning Data**

You can return:
* Single value → `return "hello"`
* Number → `return 42`
* Table (array) → `return {1, 2, 3}`
* Nil → `return nil`

---

## **🔹 Common Redis-Lua Patterns**

**A. Atomic Check-Then-Set**

```lua
if redis.call("GET", KEYS[1]) == false then
    redis.call("SET", KEYS[1], ARGV[1])
    return "SET"
else
    return "EXISTS"
end
```

---

**B. Rate Limiter**

```lua
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
if current >= tonumber(ARGV[1]) then
    return 0 -- limit reached
else
    redis.call("INCR", KEYS[1])
    redis.call("EXPIRE", KEYS[1], ARGV[2])
    return 1
end
```

Node.js:

```js
await client.eval(
  fs.readFileSync("rate_limiter.lua", "utf8"),
  { keys: ["user:123:requests"], arguments: ["5", "60"] }
);
```

---

**C. Push + Trim + Expire**

```lua
redis.call("LPUSH", KEYS[1], ARGV[1])
redis.call("LTRIM", KEYS[1], 0, tonumber(ARGV[2]) - 1)
redis.call("EXPIRE", KEYS[1], ARGV[3])
return redis.call("LRANGE", KEYS[1], 0, -1)
```

---


## **🔹 Node.js Side Quick Template**

```js
import { createClient } from "redis";
import fs from "fs";

const client = createClient();
await client.connect();

const script = fs.readFileSync("myscript.lua", "utf8");

const result = await client.eval(script, {
  keys: ["mykey"],
  arguments: ["myvalue"]
});

console.log(result);
```
