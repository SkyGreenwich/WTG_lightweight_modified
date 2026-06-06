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
Month and year jumps use calendar-aware clamping, so invalid target dates land on the last valid day of the target month.

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
| Time Duration Multiplier | 1.0 | Positive number that scales ordinary and explicit automatic elapsed time. |
| Debug Mode | false | Shows the latest dynamic-time estimate in a separate `WTG Debug` system storycard. |
| WTG Disabled | false | Stops WTG processing while leaving the scripts installed. |

Older settings named `Disable WTG Entirely` or `Disable WTG` are automatically migrated to `WTG Disabled`. The retired `Enable Dynamic Time` setting is removed automatically.

---

## Automatic Time Calculation

WTG always uses semantic dynamic-time calculation. It estimates small turn-by-turn elapsed time so the clock feels alive without letting ordinary actions jump ahead by tens of minutes. Large deliberate jumps should use `[advance]`, `[sleep]`, or `[setcurrent]`.

For ordinary actions, WTG calculates a semantic per-turn estimate and a cumulative character target of one minute per 700 characters since the latest time marker. It subtracts time already elapsed from that character target and only applies the missing catch-up amount. The larger of the semantic estimate and the catch-up amount is used, so long passages are not underestimated and old characters are not counted repeatedly.

It classifies the current turn:

- **Dialogue**: A `say` action, quoted speech, a speaker-prefixed line, or a present-tense speech verb advances exactly 1 minute.
- **Past dialogue**: Past-tense speech references such as `said`, `asked`, or `replied` are treated as memory and advance 0 minutes when no duration is stated.
- **Combat/Perception**: Usually 1-2 minutes.
- **Exploration**: Usually 1-3 minutes.
- **Work/Preparation**: Usually 2-4 minutes.
- **Travel/Waiting**: Usually 2-5 minutes.
- **Continue**: Its semantic estimate is capped at 3 minutes; character catch-up can still raise the final ordinary estimate.

Explicit duration phrases take priority over dialogue and memory detection. They are treated as hints, not absolute authority, and are capped at 10 base minutes by default. For example, "they talked for two hours" advances 10 base minutes unless you use `[advance 2 hours]`.

Similarity between the current timed text and the two most recent recorded turns dampens repeated scenes. `Time Duration Multiplier` is applied after semantic and character estimates are calculated. Dialogue remains fixed at 1 minute and past-dialogue memory remains fixed at 0 minutes.

Non-explicit estimates remain capped at 6 minutes per generation after the multiplier is applied. Invalid or non-positive multiplier values fall back to `1.0`.

---

## License & Credits

**Originally created by**: thedenial
**License**: Apache 2.0

This is a community-created tool for enhancing AI Dungeon experiences. Not officially affiliated with Latitude.
