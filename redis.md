# Redis 
In-memory data store 
- Used as cache, DB, streaming engine and mssg broker

- can also store **computed data** to fetch it faster

## Setup

## TTL

## Data types in Redis

### String
- **Redis cli, Redis Stack**
- set name piyush => OK (res)
- get name => "piyush"

- set/get <key>:<id> value
- set user:1 piyush
- set user:2 mahi

- set msg:3 hello nx => ok
- set msg:3 hello nx => nil

- xx

- mget user:1 user:2 msg:3
- mset 

- set count 0
- incr count  (1)
- incrby count 10 (11)


### Lists
- Redis lists are linked-list of strings. Used to: 
- Implement stack and queues.
- build queue management for background worker system.

- lpush, rpush, lpop, rpop
- llen, ltrim, lmove
- blpop, blmove

- lpush key value
- lpop key
- llen key
- lrange key 1 3  **(to read list)**

- stack (RR/LL) push/pop
- queues (RL/ LR) push/pop


### sets

- no duplicate values allowed
-   sadd, srem, sismember, sinter, scard (returns size of a set)

- sadd key 1, sadd key 2
- srem key 1
- sismember key 1 => 1


### Hashmaps

- 


#### del key
#### KEYS key:*