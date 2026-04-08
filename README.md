# WTG Lightweight Modified

**Original by**: https://github.com/helpfulduckie/World-Time-Generator-2.0-for-Ai-Dungeon

---

## Table of Contents

- [Overview](#overview)
- [Scripts](#scripts)
- [Installation](#installation)
- [System Commands](#system-commands)
- [Settings](#settings)
- [Dynamic Time Mode](#dynamic-time-mode)
- [License & Credits](#license--credits)

---

## Overview

WTG Lightweight Modified is a refactored derivative of WTG 2.0 Lightweight, a pure time tracking script for AI Dungeon. It automatically tracks time progression and timestamps storycards.

### Key Features

- **Automatic Time Tracking**: Time advances based on story length
- **Persistent Date & Time**: Current date and time displayed in storycards
- **Automatic Timestamps**: Storycards receive discovery timestamps when mentioned
- **Handles Commands**: Supports `[settime]`, `[advance]`, `[reset]`, `[sleep]`
- **Detects Time Jumps**: Cleans up data when you rewind adventure
- **Dynamic Time**: Optional smart time adjustment based on action type

### Changes from Original Lightweight

- **Dynamic Time Rewritten**: Enabled by default.

---

## Scripts

- **Input.js**: Processes player commands only
- **Context.js**: Manages time progression (no AI instructions)
- **Output.js**: Adds timestamps to storycards (no entity detection)
- **library.js**: Core time utility functions

---

## Installation

1. **Create or Edit a Scenario**
2. **Open Scripting** (bottom of Details tab)
3. **Copy Script Content**:
   - Copy `library copy.js` - Paste into **Library** script
   - Copy `input copy.js` - Paste into **Input** script
   - Copy `context copy.js` - Paste into **Context** script
   - Copy `output copy.js` - Paste into **Output** script
4. **Save** all scripts
5. **Start Adventure** and run `[settime 06/15/2023 8:00 AM]` to initialize

---

## System Commands

### `[settime mm/dd/yyyy time]`
Set starting date and time.

```
[settime 06/15/2023 8:00 AM]
[settime 12/25/2024 11:30 PM]
[settime 01/01/1900 12:00 am]
```

### `[advance N unit]`
Jump forward in time. Units: `hours`, `days`, `months`, `years`.

```
[advance 5 hours]
[advance 2 days]
[advance 1 month]
```

### `[sleep]`
Sleep to next morning (advances 6-8 hours + random minutes).

```
[sleep]
```

### `[reset]`
Reset to most recent date/time mentioned in story.

```
[reset]
```

---

## Settings

Configure via "World Time Generator Settings" storycard:

| Setting | Default | Description |
|---------|---------|-------------|
| Time Duration Multiplier | 1.0 | Adjust time passage speed |
| Enable Dynamic Time | true | Enable smart time adjustment based on action type |
| Debug Mode | false | Show/hide debug info |
| Disable WTG Entirely | false | Emergency disable switch |

---

## Dynamic Time Mode

When **Enable Dynamic Time** is true, the system classifies each turn to adjust time passage:

- **Dialogue**: Slower time passage (0-1 minutes)
- **Combat**: Minimal time passage (1 minute)
- **Exploration**: Moderate time passage (2 minutes)
- **Travel/Waiting**: Faster time passage (3 minutes)
- **Explicit Time Passage**: Maximum time passage (4 minutes)

Similarity between turns is also factored in to avoid time drift.

---


## License & Credits

**Orignally created by**: thedenial   
**License**: Apache 2.0

This is a community-created tool for enhancing AI Dungeon experiences. Not officially affiliated with Latitude (AI Dungeon creators).

---

**Made for the AI Dungeon community**
