# LIFF Optimization TODO

## Project

Architecture:

```
LINE LIFF
 ↓
GitHub Pages Frontend
 ↓
Google Apps Script API
 ↓
Google Sheets Database
```

Goal:

- Reduce LIFF loading time
- Keep registration / leave data realtime
- Prevent duplicate or over-limit registration
- Optimize Apps Script + Google Sheets performance


---

# TODO 1 - Refactor Apps Script API Routes

Replace single large API response with action based routes.

Implement:

```javascript
doGet(e)

?action=config
?action=status
?action=user
```

Rules:

- config:
  - system settings
  - form options
  - static data
  - allow cache

- status:
  - quota
  - registration count
  - current state
  - realtime only

- user:
  - registration record
  - leave status
  - realtime only

Remove:

- loading entire Sheet for every request


---

# TODO 2 - Optimize Google Sheets Access

Remove:

```javascript
getValue()
inside loops
```

Avoid:

```javascript
getDataRange()
```

Replace with:

```javascript
getRange(
 row,
 col,
 rows,
 cols
)
.getValues()
```

Requirements:

- batch read/write
- only required columns
- minimize Spreadsheet API calls


---

# TODO 3 - Add Apps Script CacheService

Implement server cache.

Use:

```javascript
CacheService.getScriptCache()
```

Cache:

YES:

- config
- options
- static settings

NO:

- quota
- registration status
- leave status

TTL:

```
300 - 600 seconds
```

Flow:

```
API
 ↓
Cache hit → return
 ↓
Cache miss
 ↓
Google Sheet
 ↓
Update cache
```


---

# TODO 4 - Add UserIndex Sheet

Create:

Sheet name:

```
UserIndex
```

Schema:

|Column|Data|
|-|-|
|A|lineUserId|
|B|targetSheet|
|C|rowNumber|
|D|status|
|E|updatedAt|

Purpose:

Avoid scanning registration table.


Query flow:

```
lineUserId
 ↓
UserIndex
 ↓
rowNumber
 ↓
Direct row lookup
```


Requirements:

- update index after create/update
- user API cannot scan full Sheet


---

# TODO 5 - Add Registration Lock

Prevent race condition.

Use:

```javascript
LockService.getScriptLock()
```

Flow:

```
lock

check quota

write registration

update counter

unlock
```


Requirement:

Always release lock:

```javascript
try {

}
finally {
 lock.releaseLock()
}
```


---

# TODO 6 - Optimize LIFF Startup

Remove blocking startup:

BAD:

```javascript
await liff.init()

await fetchData()
```


Change to:

```javascript
await Promise.all([
 liff.init(),
 fetchData()
])
```

Requirements:

- LIFF auth should not block public data
- parallel loading


---

# TODO 7 - Add Frontend Loading State

Implement:

States:

```
loading
success
error
```

Flow:

```
Open LIFF

↓

Render UI shell

↓

Fetch API

↓

Update data
```

Requirement:

- no blank screen in LINE WebView


---

# TODO 8 - Reduce API Payload

Remove:

Large response:

```json
{
 "rows":[...]
}
```

Return only required fields.


Example:

status:

```json
{
 "registered":true,
 "remaining":5
}
```

user:

```json
{
 "status":"registered",
 "leave":false
}
```


---

# TODO 9 - Frontend Cache Rules

localStorage allowed:

- config
- UI settings
- static options


localStorage forbidden:

- quota
- registration result
- leave state


---

# Acceptance Criteria

Performance:

- LIFF first UI render < 2 seconds
- No white screen loading


Apps Script:

- No loop getValue()
- Minimal getDataRange()
- CacheService enabled


Data:

- registration realtime
- leave status realtime
- no quota race condition


Scale:

- Google Sheet 5000+ rows usable
- API returns minimal JSON only