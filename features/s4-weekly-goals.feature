# S4 weekly goals: Memento plan node 33ebe0ff / sub-idea 18a01733 / scenario set 32e1cf94
# Refines the @S4 scenarios in habit-tracker.feature with the user's choices: weekly goals sit with
# daily habits under their list, shown as a progress ring with a count, tap = +1 with a small
# minus button to undo, tap the goal's name to edit.
# Weeks run Sunday to Saturday in local time. Tests pin the time zone to America/Chicago
# (2026-10-11 is a Sunday; 2026-03-08 has 23 hours and 2026-11-01 has 25, and both are Sundays).
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Weekly goals
  As a habit tracker user,
  I need weekly N-times goals that reset on Sunday with a weeks-in-a-row streak
  so that I can track goals like riding the Peloton 3 times a week.

  Background:
    Given the app is open on the Today tab in the iPhone Home Screen
    And the device time zone is "America/Chicago"
    And today is Wednesday "2026-10-14", in the week that started Sunday "2026-10-11"

  # --- Adding goals ---

  @happy-path
  Scenario: The New habit sheet offers a Repeats choice that defaults to every day
    When I tap "New habit"
    Then the "Repeats" selector shows "Every day"
    And no "Times per week" selector is shown

  @happy-path
  Scenario: Choosing a weekly repeat reveals the times-per-week target
    When I tap "New habit" and set "Repeats" to "Times a week"
    Then the "Times per week" selector is shown and set to 3
    And it offers the numbers 1 to 14

  @happy-path
  Scenario: Add a weekly goal to a list
    When I add the weekly goal "Peloton ride" with 3 times per week to the list "Fitness"
    Then "Peloton ride" appears under the "Fitness" header on Today
    And its ring reads "0/3" and no minus button and no streak badge are shown

  @happy-path
  Scenario: Weekly goals and daily habits share a list in their saved order
    Given the daily habit "Stretch" and then the weekly goal "Peloton ride" were added to "Fitness"
    When I view Today
    Then "Stretch" is above "Peloton ride" under the "Fitness" header

  @error
  Scenario Outline: The times-per-week target must be 1 to 14
    When I try to save the weekly goal "Peloton ride" with <target> times per week
    Then the result is "<outcome>"

    Examples:
      | target | outcome                       |
      | 1      | saved                         |
      | 14     | saved                         |
      | 0      | Pick 1 to 14 times a week     |
      | 15     | Pick 1 to 14 times a week     |
      | 2.5    | Pick 1 to 14 times a week     |

  @error
  Scenario: A weekly goal needs a name like any other habit
    When I try to save a weekly goal with a blank name
    Then no goal is saved and the message "Name can't be empty" is displayed

  # --- Logging ---

  @happy-path
  Scenario: Each tap on the ring logs one completion
    Given the weekly goal "Peloton ride" with target 3 has 1 completion this week
    When I tap its ring
    Then the ring reads "2/3"
    And its button is named "Log Peloton ride, 2 of 3 this week"
    And the ring updates within 100 ms of the tap

  @happy-path
  Scenario: Reaching the target shows the goal as met
    Given the weekly goal "Peloton ride" with target 3 has 2 completions this week
    When I tap its ring
    Then the ring reads "3/3" and is styled "met"
    And its button is named "Log Peloton ride, 3 of 3 this week, goal met"

  @edge-case
  Scenario: Logging beyond the target keeps counting
    Given the weekly goal "Peloton ride" with target 3 has 4 completions this week
    When I tap its ring
    Then the ring reads "5/3" and is still styled "met"

  @edge-case
  Scenario: Several completions on the same day all count
    Given the weekly goal "Peloton ride" with target 3 has 0 completions this week
    When I tap its ring twice
    Then the ring reads "2/3"
    And 2 completions are stored for "2026-10-14"

  @edge-case
  Scenario: Fast double taps log two completions, not a toggle
    When I tap the ring of "Peloton ride" twice within 50 ms
    Then the ring reads "2/3" and exactly 2 completions are stored

  @happy-path
  Scenario: The minus button removes the most recent completion
    Given the weekly goal "Peloton ride" with target 3 has completions on "2026-10-12" and "2026-10-14"
    When I tap its minus button named "Remove last Peloton ride log"
    Then the ring reads "1/3"
    And the completion on "2026-10-14" is gone and the one on "2026-10-12" remains

  @edge-case
  Scenario: Undo removes the latest-logged completion when several share a day
    Given the weekly goal has 2 completions on "2026-10-14" logged at different times
    When I tap its minus button
    Then exactly 1 completion remains for "2026-10-14" and it is the earlier one

  @edge-case
  Scenario: The minus button only shows when there is something to remove
    Given the weekly goal "Peloton ride" has 0 completions this week
    Then no minus button is shown
    When I tap its ring
    Then the minus button is shown

  @integration
  Scenario: Logged completions survive a reload
    Given I logged "Peloton ride" twice
    When I reload the page
    Then its ring reads "2/3"

  # --- Weeks and the Sunday reset ---

  @edge-case
  Scenario Outline: Weeks run from Sunday to Saturday
    Then the week containing "<day>" starts on Sunday "<week_start>"

    Examples:
      | day        | week_start | note                          |
      | 2026-10-11 | 2026-10-11 | a Sunday starts its own week  |
      | 2026-10-14 | 2026-10-11 | midweek                       |
      | 2026-10-17 | 2026-10-11 | Saturday ends the week        |
      | 2026-10-18 | 2026-10-18 | the next Sunday               |
      | 2026-03-08 | 2026-03-08 | spring forward Sunday (23 h)  |
      | 2026-03-14 | 2026-03-08 | its Saturday                  |
      | 2026-11-01 | 2026-11-01 | fall back Sunday (25 h)       |
      | 2026-01-01 | 2025-12-28 | week spanning the new year    |

  @edge-case
  Scenario: The count resets on Sunday
    Given "Peloton ride" has 3 completions in the week of "2026-10-11"
    When the date becomes Sunday "2026-10-18"
    Then its ring reads "0/3"

  @edge-case
  Scenario: A Saturday-night completion counts for the week that is ending
    Given the time is Saturday "2026-10-17 23:58"
    When I tap the ring of "Peloton ride"
    Then the completion is stored for "2026-10-17" and counts toward the week of "2026-10-11"

  @edge-case
  Scenario: The ring resets by itself when the app is open across Saturday midnight
    Given the app is open at Saturday "2026-10-17 23:59:50" and "Peloton ride" shows "3/3"
    When the clock passes "2026-10-18 00:00:00"
    Then within 2 seconds the ring reads "0/3"
    And the date header reads "Sunday, October 18"

  @edge-case
  Scenario: A tap on a stale screen just after Saturday midnight counts for the new week
    Given the screen still shows Saturday "2026-10-17" with "Peloton ride" at "3/3"
    And the real time is "2026-10-18 00:00:05"
    When I tap its ring
    Then the completion is stored for "2026-10-18"
    And the ring reads "1/3"

  @edge-case
  Scenario Outline: Weeks that start on a daylight-saving day still have seven days
    Given "Peloton ride" with target 7 has one completion on each day from "<start>" to "<end>"
    Then the ring reads "<count>/7" on "<end>"

    Examples:
      | start      | end        | count |
      | 2026-03-08 | 2026-03-14 | 7     |
      | 2026-11-01 | 2026-11-07 | 7     |
      | 2025-12-28 | 2026-01-03 | 7     |

  @edge-case
  Scenario: Completions dated after today are not counted
    Given "Peloton ride" has completions on "2026-10-14" and "2026-10-16"
    When I view Today on "2026-10-14"
    Then its ring reads "1/3"

  # --- Weeks-in-a-row streak ---

  @happy-path
  Scenario: Weeks in a row build a weekly streak, dimmed while this week is open
    Given "Peloton ride" with target 3 met its target in the weeks starting "2026-09-20", "2026-09-27" and "2026-10-04"
    And it has 1 completion this week
    When I view Today
    Then its streak badge reads "🔥 3"
    And the badge label is "3 week streak, not met yet this week"
    And the badge is styled "at risk"

  @happy-path
  Scenario: Meeting this week's target adds it to the streak
    Given the same three met weeks and 2 completions this week
    When I tap its ring
    Then its streak badge reads "🔥 4"
    And the badge label is "4 week streak"
    And the badge is not styled "at risk"

  @edge-case
  Scenario: Missing a weekly target resets the streak
    Given "Peloton ride" with target 3 met its target in the week starting "2026-09-27"
    And it had only 2 completions in the week starting "2026-10-04"
    When I view Today
    Then no streak badge is shown

  @edge-case
  Scenario: Exceeding the target counts as meeting it
    Given "Peloton ride" with target 3 had 5 completions in the week starting "2026-10-04"
    And 3 completions in the week starting "2026-09-27"
    And 0 completions this week
    When I view Today
    Then its streak badge reads "🔥 2"

  @edge-case
  Scenario: Weeks before the goal existed are not part of the streak
    Given "Peloton ride" was created on "2026-10-06" and met its target in the week starting "2026-10-04"
    When I view Today
    Then its streak badge reads "🔥 1"

  @edge-case
  Scenario: A goal created mid-week is judged against the full target that week
    Given "Peloton ride" with target 3 was created on Thursday "2026-10-08" and has 2 completions that week
    When the date becomes Sunday "2026-10-18"
    Then no streak badge is shown

  # --- Versioned targets ---

  @happy-path
  Scenario: Creating a goal records its target from the start of the current week
    When I add the weekly goal "Peloton ride" with 3 times per week
    Then a target record exists with effectiveWeekStart "2026-10-11" and target 3

  @edge-case
  Scenario: Raising the target does not rewrite past weeks
    Given "Peloton ride" had target 3 and met it in the weeks starting "2026-09-27" and "2026-10-04"
    When I change the target to 4 on "2026-10-14"
    Then the target for the week starting "2026-10-11" is 4
    And the weeks starting "2026-09-27" and "2026-10-04" are still counted as met
    And the streak is 2 with this week not met yet

  @edge-case
  Scenario: Lowering the target does not turn failed weeks into met weeks
    Given "Peloton ride" had target 4 and 3 completions in the week starting "2026-10-04"
    When I change the target to 3 on "2026-10-14"
    Then the week starting "2026-10-04" is still not met
    And the streak is 0

  @edge-case
  Scenario: Editing the target twice in one week keeps a single record
    When I change the target to 4 and then to 5 on "2026-10-14"
    Then exactly one target record exists for the week starting "2026-10-11" and it says 5

  @edge-case
  Scenario: A changed target applies to the weeks from then on and not before
    Given "Peloton ride" had target 3 until the week of "2026-10-04" and target 4 from the week of "2026-10-11"
    And 3 completions in each of the weeks starting "2026-09-27", "2026-10-04" and "2026-10-11"
    When I view Today on "2026-10-14"
    Then the streak is 2 and this week shows "3/4"

  @edge-case
  Scenario: A clock set before the goal's first record uses the first target
    Given "Peloton ride" was created in the week of "2026-10-11" with target 3
    When today is "2026-10-07"
    Then the ring shows the target 3

  # --- Editing from the name ---

  @happy-path
  Scenario: Tapping the goal's name opens the edit sheet, not a log
    When I tap the name "Peloton ride"
    Then a dialog named "Edit weekly goal" is displayed with "Name", "List" and "Times per week" filled in
    And the ring still reads "0/3"

  @happy-path
  Scenario: Changing the target saves and updates the ring
    When I tap the name "Peloton ride", change "Times per week" to 4 and tap "Save"
    Then the ring reads "0/4"

  @happy-path
  Scenario: Renaming and moving a goal keeps its history
    Given "Peloton ride" in "Fitness" has 2 completions this week
    When I rename it "Spin class" and move it to "Personal"
    Then "Spin class" appears under "Personal" with the ring "2/3"
    And "Fitness" no longer shows it

  @edge-case
  Scenario: Cancelling the edit changes nothing
    When I tap the name "Peloton ride", change "Times per week" to 6 and tap "Cancel"
    Then the ring still reads "0/3"

  # --- Storage failures ---

  @error
  Scenario: A failed log is reverted and reported
    Given IndexedDB rejects the next write
    When I tap the ring of "Peloton ride"
    Then the ring returns to "0/3"
    And the message "Couldn't save. Your phone may be out of storage." is displayed

  @error
  Scenario: A failed undo is reverted and reported
    Given "Peloton ride" has 1 completion and IndexedDB rejects the next write
    When I tap its minus button
    Then the ring returns to "1/3"
    And the message "Couldn't save. Your phone may be out of storage." is displayed

  @error
  Scenario: A failed save keeps the sheet open
    Given IndexedDB rejects the next write
    When I add the weekly goal "Peloton ride" with 3 times per week
    Then the sheet stays open with the message "Couldn't save. Your phone may be out of storage."

  @error
  Scenario: A failure to read the target history is reported
    Given the target history cannot be read
    When I open Today
    Then a status message reads "Couldn't load your habits. Close and reopen the app."
    And no weekly goals are shown with wrong counts

  # --- Integration ---

  @integration
  Scenario: A deleted list's weekly goals leave Today but keep their history
    Given "Peloton ride" in "Fitness" has completions and a target record
    When I delete the list "Fitness"
    Then "Peloton ride" is no longer on Today
    And it has an archivedAt timestamp and its completions and target record remain in storage

  # --- Security ---

  @security
  Scenario: Weekly goal names containing HTML are shown as plain text
    When I add the weekly goal "<img src=x onerror=alert(1)>" with 3 times per week
    Then the row text is literally "<img src=x onerror=alert(1)>"
    And 0 img elements are added to the document

  @security
  Scenario: Logging goals sends no data over the network
    When I add a weekly goal, log it twice and remove one
    Then 0 network requests are made other than same-origin app files

  # --- Performance ---

  @performance
  Scenario: Fifty weekly goals with a year of history compute quickly
    Given 50 weekly goals each have a completion every week for 52 weeks and 2 target changes
    When Today renders
    Then all counts, streaks and groups are computed in under 50 ms
    And a ring tap changes its count within 100 ms

  # --- Accessibility ---

  @accessibility
  Scenario: The ring, name and minus controls are labelled and large enough
    Given "Peloton ride" has 2 of 3 completions and a 4 week streak
    When I view Today with VoiceOver
    Then the ring button is named "Log Peloton ride, 2 of 3 this week"
    And the name button is named "Edit Peloton ride" and the minus button "Remove last Peloton ride log"
    And the streak badge has role "img" and the label "4 week streak, not met yet this week"
    And every one of them is at least 44 by 44 CSS pixels

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code and the coverage gate holds
    Given features/s4-weekly-goals.feature was committed before any S4 code
    Then Vitest meets the tiered coverage thresholds and the build exits 0 (Build verification, Test coverage >=95% for logic)

  @regression
  Scenario: No mocks in production code; ServiceResult-style results; cancellation
    Then no production file under "src/" contains test doubles
    And every new items repository method returns Result<T> (the ServiceResult<T> pattern)
    And the clock watcher still returns a stop function that cancels its timers (async cancellation)

  @regression
  Scenario: SOLID principles and Clean Architecture boundaries
    Then "src/domain" imports nothing from "src/data", "src/platform" or "src/ui"
    And week and weekly-streak rules exist only in "src/domain/dates.ts" and "src/domain/weekly.ts"
    And no module exceeds 300 lines

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
