# WTG Lightweight Modified

**Original by**: https://github.com/helpfulduckie/World-Time-Generator-2.0-for-Ai-Dungeon

---

## Table of Contents

- [Overview](#overview)
- [Scripts](#scripts)
- [Installation](#installation)
- [System Commands](#system-commands)
- [Settings](#settings)
- [Dynamic Time](#dynamic-time)
- [License & Credits](#license--credits)

---

## Overview

WTG Lightweight Modified is a time tracking script for AI Dungeon based on WTG 2.0 Lightweight.

### Key Features

- Automatically tracks story date and time
- Maintains a current date and time storycard
- Adds discovery timestamps to mentioned storycards
- Supports manual time commands
- Handles history rewinds and retries
- Uses dynamic time estimation

---

## Scripts

- **library.js**: Core functions and WTG logic
- **Input.js**: Processes player input and commands
- **Context.js**: Reconstructs the clock and adds time context
- **Output.js**: Calculates time passage, records turns, and timestamps storycards

---

## Installation

1. Create or edit an AI Dungeon scenario.
2. Open **Scripting**.
3. Copy each file into its matching script panel:
   - `library.js` -> **Library**
   - `Input.js` -> **Input**
   - `Context.js` -> **Context**
   - `Output.js` -> **Output**
4. Save all scripts.

The default starting date and time are configured at the top of `library.js`.

---

## System Commands

### `[settime mm/dd/yyyy time]`

Set a new starting date and time.

```text
[settime 06/15/2023 8:00 AM]
```

### `[setcurrent mm/dd/yyyy [time]]`

Set the current date and optionally the current time.

```text
[setcurrent 06/20/2023 9:30 AM]
```

### `[advance N unit]`

Advance minutes, hours, days, months, or years. Combined values are supported.

```text
[advance 30 minutes]
[advance 1 month 2 days]
```

### `[sleep]`

Advance time according to the current time of day.

```text
[sleep]
```

### `[reset]`

Reset to the most recent date and time mentioned in history.

```text
[reset]
```

---

## Settings

Configure WTG through the **World Time Generator Settings** storycard:

| Setting | Default | Description |
|---------|---------|-------------|
| Time Duration Multiplier | 1.0 | Adjust time passage speed |
| Debug Mode | false | Write the latest estimate to the WTG Debug storycard |
| WTG Disabled | false | Disable WTG processing |

---

## Dynamic Time

WTG estimates time passage from the current action and story text. Use the system commands when an exact time change is required.

---

## License & Credits

**Originally created by**: thedenial
**License**: Apache 2.0

This is a community-created tool for AI Dungeon and is not officially affiliated with Latitude.
