# WTG Lightweight Modified

**Original by**: https://github.com/helpfulduckie/World-Time-Generator-2.0-for-Ai-Dungeon

---

## Overview

WTG Lightweight Modified is a refactored derivative of WTG 2.0 Lightweight for AI Dungeon. It tracks in-story date and time, maintains a current date/time storycard, and timestamps storycards when their keywords appear in the player action or AI response.

### Key Features

- **Automatic Time Tracking**: Time advances from explicit durations, action type, response length, and repetition similarity.
- **Persistent Date & Time**: Current and starting date/time are stored in the "Current Date and Time" storycard.
- **Automatic Timestamps**: Mentioned storycards receive discovery timestamps.
- **System Commands**: Supports `[settime]`, `[setcurrent]`, `[advance]`, `[reset]`, and `[sleep]`.
- **Rewind Cleanup**: Removes future turn data and future storycard timestamps after history rollback.
- **Structured Turn Data**: New turn records are stored as JSON in the internal WTG Data card, with legacy text records still readable.

---

## Scripts

- **library.js**: Core time utility and hook logic.
- **Input.js**: Processes player commands and captures player input.
- **Context.js**: Advances time and injects hidden chronology guidance plus current date/time.
- **Output.js**: Sanitizes output, timestamps storycards, and records turn data.

---

## Installation

1. Create or edit a scenario.
2. Open **Scripting** from the scenario details.
3. Copy each repository file into the matching AI Dungeon script panel:
   - `library.js` -> **Library**
   - `Input.js` -> **Input**
   - `Context.js` -> **Context**
   - `Output.js` -> **Output**
4. Save all scripts.
5. Optionally run `[settime 06/15/2023 8:00 AM]` to replace the configured scene default.

The built-in scene default is configured at the top of `library.js`.

---

## System Commands

### `[settime mm/dd/yyyy time]`

Set the starting date and time, resetting elapsed turn time.

```text
[settime 06/15/2023 8:00 AM]
[settime 12/25/2024 11:30 PM]
[settime 01/01/1900 20:00]
```

Supported time inputs include `h:mm AM/PM`, `h AM/PM`, `HH:mm`, and configured descriptive values such as `morning` or `night`. Invalid times are rejected instead of being silently normalized.

### `[setcurrent mm/dd/yyyy [time]]`

Set the current date/time without changing the starting date/time. Elapsed turn time is recalculated from the start.

```text
[setcurrent 06/20/2023]
[setcurrent 06/14/2023 8:00 AM]
```

If the target date/time is earlier than the starting date/time, `Turn time` is stored with a leading `-`, such as `-00y00m01d00h00n00s`. When time is omitted, WTG keeps the current clock if available, otherwise it uses the starting clock.

### `[advance N unit]`

Jump forward in time. Units: `minutes`, `hours`, `days`, `months`, `years`. Combined values are supported.

```text
[advance 30 minutes]
[advance 5 hours]
[advance 1 month 2 days]
```

### `[sleep]`

Advance sleep time based on the current clock bucket, plus random minutes.

```text
[sleep]
```

### `[reset]`

Reset to the most recent date/time mentioned in history.

```text
[reset]
```

---

## Settings

Configure via the "World Time Generator Settings" storycard:

| Setting | Default | Description |
|---------|---------|-------------|
| Time Duration Multiplier | 1.0 | Scales automatic elapsed time. |
| Enable Dynamic Time | true | Uses semantic action timing instead of pure character count. |
| Debug Mode | false | Shows the latest dynamic-time estimate in a separate `WTG Debug` system storycard. |
| WTG Disabled | false | Stops WTG processing while leaving the scripts installed. |

Older settings named `Disable WTG Entirely` or `Disable WTG` are automatically migrated to `WTG Disabled`.

---

## Dynamic Time Mode

Dynamic Time first detects explicit elapsed durations. Examples like "wait for two hours", "overnight", or "tomorrow" directly advance the clock by the stated duration.

When no explicit duration is found, it classifies the current turn:

- **Dialogue**: Usually 0-2 minutes.
- **Combat/Perception**: Usually 1-4 minutes.
- **Exploration**: Several minutes, based on text length and repetition.
- **Work/Preparation**: Tens of minutes when the action implies sustained effort.
- **Travel/Waiting**: The largest automatic jumps, capped to avoid runaway drift.
- **Continue**: Uses accumulated response length after the last authoritative marker.

Similarity to recent turns dampens repeated scenes, while low similarity can slightly increase elapsed time. `Time Duration Multiplier` scales the final result.

---

## Local Verification

Run the smoke tests with Node:

```powershell
node tests\wtg-smoke.test.js
```

The tests cover strict time parsing, setting migration, JSON turn data, default-date timestamping, Dynamic Time estimates, and Debug Mode visibility.

When Debug Mode is enabled, the `WTG Debug` card has empty keys so the diagnostic text remains visible to the user without being intentionally pulled into AI context.

---

## License & Credits

**Originally created by**: thedenial
**License**: Apache 2.0

This is a community-created tool for enhancing AI Dungeon experiences. Not officially affiliated with Latitude.
