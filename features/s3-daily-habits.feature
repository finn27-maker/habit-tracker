# S3 daily habits: Memento plan node eb841074 / sub-idea a64ebe66 / scenario set d2dd8f8b
# Refines the @S3 scenarios in habit-tracker.feature with the user's choices: a + on Today,
# round checkbox + flame streak, grouped by list, checked habits stay in place.
# Tests pin the time zone to America/Chicago (DST: 2026-03-08 has 23 hours, 2026-11-01 has 25).
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Daily habits
  As a habit tracker user,
  I need daily habits that reset each day with a strict streak
  so that I can build routines and see my consistency.

  Background:
    Given the app is open on the Today tab in the iPhone Home Screen
    And the device time zone is "America/Chicago"
    And today is "2026-10-14"

  # --- Adding habits ---

  @happy-path
  Scenario: The plus button opens the New habit sheet
    When I tap "New habit"
    Then a dialog named "New habit" is displayed
    And it has a "Name" field, a "List" selector and the hint "Repeats every day."

  @happy-path
  Scenario: Add a daily habit to a list
    When I add the habit "Meditate" to the list "Personal"
    Then "Meditate" appears under the "Personal" header on Today
    And its checkbox is unchecked and no streak badge is shown

  @happy-path
  Scenario: The list selector defaults to the first list
    When I tap "New habit"
    Then the "List" selector shows "🏋️ Fitness"

  @happy-path
  Scenario: Fresh installs can add a habit straight away
    Given the app is opened for the first time and Today is the first screen
    When I tap "New habit"
    Then the "List" selector offers "Fitness", "Work", "Side Business" and "Personal"

  @happy-path
  Scenario: Habits are grouped by list in list order
    Given "Stretch" is a habit in "Fitness" and "Inbox zero" is a habit in "Work"
    And the lists are ordered "Work", "Fitness", "Side Business", "Personal"
    When I view Today
    Then the headers read "Work" then "Fitness"
    And "Inbox zero" is under "Work" and "Stretch" is under "Fitness"
    And lists with no habits have no header

  # --- Checking off ---

  @happy-path
  Scenario: One tap checks a habit off for today
    Given the habit "Meditate" exists
    When I tap its checkbox
    Then the checkbox has aria-checked "true"
    And the visual state changes within 100 ms of the tap
    And a completion exists for "Meditate" on "2026-10-14"

  @happy-path
  Scenario: Checked habits stay where they are
    Given "Meditate" is the first of three habits in "Personal"
    When I check off "Meditate"
    Then the three habits are still in their original order

  @happy-path
  Scenario: Tapping a checked habit again un-checks it
    Given "Meditate" is checked today with a streak of 5
    When I tap its checkbox
    Then the checkbox has aria-checked "false"
    And its streak badge reads "🔥 4"
    And no completion exists for "Meditate" on "2026-10-14"

  @integration
  Scenario: Check-off and habits survive a reload
    Given I added "Meditate" and checked it off
    When I reload the page
    Then "Meditate" is listed and its checkbox has aria-checked "true"

  # --- Strict streak rules ---

  @happy-path
  Scenario: Consecutive days build a streak
    Given "Meditate" was completed on "2026-10-11", "2026-10-12" and "2026-10-13"
    When I check off "Meditate" today
    Then its streak badge reads "🔥 4"

  @edge-case
  Scenario: Yesterday's streak carries into a new day and is marked at risk
    Given "Meditate" was completed on "2026-10-12" and "2026-10-13"
    And "Meditate" is not done today
    When I view Today
    Then its streak badge reads "🔥 2"
    And the badge is styled "at risk"
    And the badge label is "2 day streak, not done today"

  @edge-case
  Scenario: Completing an at-risk habit extends the streak
    Given "Meditate" was completed on "2026-10-12" and "2026-10-13"
    When I check off "Meditate" today
    Then its streak badge reads "🔥 3"
    And the badge is not styled "at risk"

  @edge-case
  Scenario: Missing a day resets the streak to nothing
    Given "Meditate" was completed on "2026-10-11" and "2026-10-12" but not on "2026-10-13"
    And "Meditate" is not done today
    When I view Today
    Then no streak badge is shown for "Meditate"

  @edge-case
  Scenario: A habit done today after a gap starts a new streak of 1
    Given "Meditate" was completed on "2026-10-10" and "2026-10-11" but not on "2026-10-12" or "2026-10-13"
    When I check off "Meditate" today
    Then its streak badge reads "🔥 1"

  @edge-case
  Scenario: Duplicate and future completions do not inflate a streak
    Given "Meditate" has completions on "2026-10-13", "2026-10-13", "2026-10-15" and "2026-10-16"
    And "Meditate" is not done today
    When I view Today
    Then its streak badge reads "🔥 1"

  @edge-case
  Scenario Outline: Streaks survive daylight saving changes
    Given "Meditate" was completed every day from "<start>" to "<end>"
    And today is "<end>"
    Then its streak is <streak>

    Examples:
      | start      | end        | streak | note                               |
      | 2026-03-06 | 2026-03-10 | 5      | spring forward on 2026-03-08       |
      | 2026-10-30 | 2026-11-03 | 5      | fall back on 2026-11-01            |
      | 2025-12-30 | 2026-01-02 | 4      | year boundary                      |
      | 2028-02-27 | 2028-03-01 | 4      | leap day 2028-02-29                |

  # --- A new day starts on its own ---

  @edge-case
  Scenario: Habits reset at local midnight while the app stays open
    Given the app is open at "2026-10-14 23:59:50" and "Meditate" is checked
    When the clock passes "2026-10-15 00:00:00"
    Then within 2 seconds the checkbox has aria-checked "false"
    And the date header reads "Thursday, October 15"
    And the streak badge is styled "at risk"

  @edge-case
  Scenario Outline: Returning to the app on a new day recomputes today
    Given the app was last visible at "2026-10-14 22:00" with "Meditate" checked
    When "<signal>" fires at "2026-10-15 07:00"
    Then the checkbox has aria-checked "false"

    Examples:
      | signal           |
      | visibilitychange |
      | pageshow         |
      | focus            |

  @edge-case
  Scenario: A 30-second check catches a new day when no resume event fires
    Given the app was suspended across midnight and no resume event fires
    When 30 seconds of timers run after the app wakes
    Then today is recomputed and yesterday's checkmarks are cleared

  @edge-case
  Scenario Outline: The midnight timer is scheduled on the local calendar, not in 24-hour steps
    Given the time is "<now>"
    Then the next midnight is "<midnight>" after <hours> hours

    Examples:
      | now              | midnight         | hours |
      | 2026-03-07 23:00 | 2026-03-08 00:00 | 1     |
      | 2026-03-08 00:30 | 2026-03-09 00:00 | 22.5  |
      | 2026-10-31 23:00 | 2026-11-01 00:00 | 1     |
      | 2026-11-01 00:30 | 2026-11-02 00:00 | 24.5  |

  @edge-case
  Scenario: A tap on a stale screen just after midnight is recorded on the real day
    Given the screen still shows "2026-10-14" because no rollover has run yet
    And the real time is "2026-10-15 00:00:05"
    When I tap the checkbox of "Meditate"
    Then the completion is stored for "2026-10-15"
    And the screen switches to "2026-10-15" with "Meditate" checked

  @edge-case
  Scenario: A timer that fires slightly early does not loop or double-fire
    Given the midnight timer fires at "2026-10-14 23:59:59.800"
    Then the day has not changed and no change is reported
    And the next check is scheduled at least 1 second later

  @edge-case
  Scenario: Leaving Today stops all timers and listeners
    When I switch to the Lists tab
    Then the midnight timeout, the interval and the resume listeners are all cleared

  # --- Validation ---

  @error
  Scenario Outline: Invalid habits are rejected with a specific message
    When I try to save a habit named "<name>"
    Then no habit is saved
    And the message "<message>" is displayed

    Examples:
      | name                                                               | message                                  |
      |                                                                    | Name can't be empty                      |
      | AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA | Name must be 60 characters or fewer      |

  @edge-case
  Scenario: Spaces around a habit name are trimmed
    When I add the habit "   Meditate   " to the list "Personal"
    Then the saved name is "Meditate"

  @edge-case
  Scenario: With no lists the sheet asks the user to create one first
    Given I deleted every list
    When I tap "New habit"
    Then the sheet says "Create a list in the Lists tab first, then come back to add a habit."
    And there is no Save button and a "Close" button

  @error
  Scenario: Adding a habit to a list that no longer exists is refused
    Given the sheet is open for the list "Personal" and that list is deleted
    When I tap "Save"
    Then the message "List not found" is displayed

  # --- Storage failures ---

  @error
  Scenario: A failed check-off is reverted and reported
    Given IndexedDB rejects the next write with a "Connection to Indexed Database server lost" error
    When I tap the checkbox of "Meditate"
    Then the checkbox returns to aria-checked "false"
    And the message "Couldn't save. Your phone may be out of storage." is displayed
    And the repository returns a failed Result instead of throwing

  @error
  Scenario: A failed save keeps the sheet open
    Given IndexedDB rejects the next write
    When I add the habit "Meditate" to the list "Personal"
    Then the sheet stays open with the message "Couldn't save. Your phone may be out of storage."

  @error
  Scenario: A failed load is reported instead of an empty screen
    Given IndexedDB is unavailable at launch
    When I open Today
    Then a status message reads "Couldn't load your lists. Close and reopen the app."
    And the empty-state text is not shown

  # --- Integration ---

  @integration
  Scenario: A deleted list's habits leave Today but keep their history
    Given "Stretch" in "Fitness" was completed on "2026-10-13"
    When I delete the list "Fitness"
    Then "Stretch" is no longer on Today
    And "Stretch" still has an archivedAt timestamp and its completion in storage

  @integration
  Scenario: Fast double taps leave a consistent record
    When I tap the checkbox of "Meditate" twice within 50 ms
    Then exactly 0 completions exist for "Meditate" on today
    And the checkbox has aria-checked "false"

  @integration
  Scenario: Today shows the empty state when there are no habits
    Given no habits exist
    When I view Today
    Then the message "Nothing here yet. Tap + to add your first habit or to-do." is displayed

  # --- Security ---

  @security
  Scenario: Habit names containing HTML are shown as plain text
    When I add the habit "<img src=x onerror=alert(1)>" to the list "Personal"
    Then the row text is literally "<img src=x onerror=alert(1)>"
    And 0 img elements are added to the document

  @security
  Scenario: Checking habits off sends no data over the network
    When I add a habit, check it off and un-check it
    Then 0 network requests are made other than same-origin app files

  # --- Performance ---

  @performance
  Scenario: Fifty habits with a year of history compute quickly
    Given 50 habits each have 365 consecutive completions
    When Today renders
    Then all streaks and groups are computed in under 50 ms
    And a checkbox tap changes its visual state within 100 ms

  # --- Accessibility ---

  @accessibility
  Scenario: Checkboxes expose their state and are large enough
    When I view Today with a habit "Meditate"
    Then the habit is a checkbox named "Meditate" with aria-checked
    And its tap target is at least 44 by 44 CSS pixels
    And the streak badge has role "img" and a label such as "4 day streak"

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code and the coverage gate holds
    Given features/s3-daily-habits.feature was committed before any S3 code
    Then Vitest meets the tiered coverage thresholds and the build exits 0 (Build verification, Test coverage >=95% for logic)

  @regression
  Scenario: No mocks in production code; ServiceResult-style results; cancellation
    Then no production file under "src/" contains test doubles
    And every items repository method returns Result<T> (the ServiceResult<T> pattern)
    And the clock watcher returns a stop function that cancels its timers (async cancellation)

  @regression
  Scenario: SOLID principles and Clean Architecture boundaries
    Then "src/domain" imports nothing from "src/data", "src/platform" or "src/ui"
    And streak rules exist only in "src/domain/streaks.ts" and are not re-implemented in components
    And no module exceeds 300 lines

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
