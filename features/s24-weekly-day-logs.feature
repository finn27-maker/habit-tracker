# Several check-ins on one past day: Memento plan node d0e7bccb / scenario set 36425f8a
# Owner's choice 2026-11-09: "Tap opens − 2 +". Today a past-day tap on a weekly goal's calendar
# adds one log and a second tap removes it, so a past day could never hold two.
# Replaces s6-history "Backfilling a weekly goal adds or removes one log for that day" and
# "A day with two logs loses one per tap". Daily habits keep tap-to-toggle.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Wednesday 2026-10-14; "Peloton ride" is a weekly goal with 3 per week.

Feature: Several check-ins on one day for a weekly goal
  As a habit tracker user,
  I need a − count + sheet when I tap a day on a weekly goal's calendar
  so that I can record two rides on the same day after the fact.

  # --- The sheet ---

  @happy-path
  Scenario: Tapping a past day opens the day sheet
    When I open "Peloton ride" and tap "October 12, 0 logs"
    Then a dialog named "Monday, October 12" shows "Peloton ride", the count "0 logs", and the buttons "Remove a log", "Add a log" and "Done"

  @happy-path
  Scenario: Two taps on + record two rides that day
    Given the day sheet for October 12 is open with 0 logs
    When I tap "Add a log" twice
    Then the sheet shows "2 logs", storage holds 2 completions on 2026-10-12, and the week shows 2 of 3

  @happy-path
  Scenario: Done closes the sheet and the calendar shows ×2
    Given I added 2 logs on October 12 in the day sheet
    When I tap "Done"
    Then the dialog is gone and the calendar button reads "October 12, 2 logs" with "×2" on the day

  @happy-path
  Scenario: − removes one log at a time
    Given "Peloton ride" has 3 logs on 2026-10-12
    When I open its day sheet and tap "Remove a log"
    Then the sheet shows "2 logs" and storage holds 2 completions on 2026-10-12

  @happy-path
  Scenario: Today's date opens the same sheet
    When I tap "October 14, 1 log" on the calendar
    Then the day sheet for "Wednesday, October 14" opens with "1 log"

  @happy-path
  Scenario: Daily habits still toggle with one tap
    When I open the daily habit "Stretch" and tap "October 12, not done"
    Then no sheet opens and the button reads "October 12, done"

  # --- Limits and edge cases ---

  @edge-case
  Scenario: − is disabled at zero
    Given the day sheet for a day with 0 logs is open
    Then the "Remove a log" button is disabled

  @edge-case
  Scenario: + stops at 14 logs on one day
    Given "Peloton ride" has 14 logs on 2026-10-12
    When I open its day sheet
    Then the "Add a log" button is disabled and the sheet shows "14 logs"

  @edge-case
  Scenario: Future days stay locked
    Then the calendar button "October 15" is disabled and no sheet can open for it

  @edge-case
  Scenario: Logs added to a past week change that week's result, not this week's
    Given "Peloton ride" had 2 logs in the week of October 4 and 1 log this week
    When I add a log on October 9 in the day sheet
    Then the week of October 4 reaches 3 of 3 and this week still shows 1 of 3

  @edge-case
  Scenario: The count reads correctly for one log
    Given the day sheet shows 0 logs
    When I tap "Add a log"
    Then the count reads "1 log", not "1 logs"

  # --- Errors and accessibility ---

  @error
  Scenario: A change that can't be saved is undone and reported
    Given IndexedDB rejects the next write
    When I tap "Add a log" in the day sheet
    Then the count goes back to what it was and "Couldn't save. Your phone may be out of storage." is shown

  @custom-accessibility
  Scenario: The count is announced as it changes
    Then the count is in a polite live region, so VoiceOver reads "2 logs" after a tap, and every button is at least 44 by 44 pixels

  @security
  Scenario: A goal name stays plain text in the sheet
    Given a weekly goal named "<img src=x onerror=alert(1)>"
    When I open a day sheet for it
    Then the name shows as text and no image element is created

  # --- Integration and performance ---

  @integration
  Scenario: Day logs survive a reload and a backup
    Given I added 2 logs on October 12 in the day sheet
    When I reload the app, then export and restore a backup
    Then the calendar still reads "October 12, 2 logs"

  @performance
  Scenario: The sheet opens without a visible wait on a goal with 600 logs
    Given "Peloton ride" has 600 logs over 3 years
    When I tap a past day
    Then the sheet is visible with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then every + and − goes through the items repository's Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the per-day limit lives in src/domain, the sheet is its own component, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
