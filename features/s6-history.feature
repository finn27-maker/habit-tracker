# S6 history: Memento plan node 2fcbf804 / sub-idea b96d97d0 / scenario set d4222b4f
# User choices 2026-10-12: tapping a habit's or goal's name opens a detail page (Edit moves there);
# any past day can be backfilled; 6-month heatmap; extras: best streak, completion rate, total count.
# Archived items are out of scope. To-dos keep "name opens Edit".
# Today is Wednesday 2026-10-14 in America/Chicago unless a scenario says otherwise.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Habit and goal history
  As a habit tracker user,
  I need a page per habit or goal with streaks, rates, a calendar I can correct and a heatmap
  so that I can see how consistent I have really been and fix days I did but forgot to tap.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Wednesday "2026-10-14"

  # --- Opening the page ---

  @happy-path
  Scenario: Tapping a daily habit's name opens its page
    Given the daily habit "Meditate" in "Personal"
    When I tap the link "Meditate details" on Today
    Then the URL hash is "#/item/<Meditate's id>"
    And a heading "Meditate" is shown with a "Back" link and an "Edit" button
    And the circle checkbox "Meditate" on Today still checks it off without opening the page

  @happy-path
  Scenario: Tapping a weekly goal's name opens its page
    Given the weekly goal "Peloton ride" with 3 per week
    When I tap the link "Peloton ride details" on Today
    Then a heading "Peloton ride" is shown
    And the ring button "Log Peloton ride, 0 of 3 this week" stays on Today

  @happy-path
  Scenario: Back returns to where I came from
    Given I opened "Meditate" from the "Personal" list page
    When I tap "Back"
    Then the URL hash is "#/list/<Personal's id>"

  @edge-case
  Scenario: Opening a page directly, Back goes to Today
    When I open "#/item/<Meditate's id>" in a fresh app launch
    And I tap "Back"
    Then the URL hash is "#/today"

  @edge-case
  Scenario: To-dos still open Edit from their name
    Given the to-do "Clean garage"
    When I tap the button "Edit Clean garage"
    Then a dialog named "Edit to-do" is shown and the URL hash is unchanged

  @error
  Scenario: A missing or deleted item's page says so
    When I open "#/item/does-not-exist"
    Then the message "This habit no longer exists" and a "Back" link are shown

  # --- Stats: daily habits ---

  @happy-path
  Scenario: A daily habit shows current streak, best streak, rates and total
    Given "Meditate" was done on 2026-10-01 to 2026-10-05 and 2026-10-12 to 2026-10-14
    When I open its page
    Then "Current streak" reads "3 days"
    And "Best streak" reads "5 days"
    And "Last 30 days" reads "57%"
    And "All time" reads "57%"
    And "Total" reads "8"

  @edge-case
  Scenario: Today counts toward the rate only once it is done
    Given "Meditate" was done every day from 2026-10-10 to 2026-10-13 but not yet today
    When I open its page
    Then "Last 30 days" reads "100%"

  @edge-case
  Scenario: A habit never done shows dashes, not a misleading 0%
    Given the daily habit "Stretch" has no completions
    When I open its page
    Then "Current streak" reads "0 days", "Best streak" reads "0 days", "Last 30 days" reads "—" and "Total" reads "0"

  @edge-case
  Scenario: The 30-day window ignores days older than 30 days
    Given "Meditate" was done on 2026-08-01 and on 2026-10-14 only
    When I open its page
    Then "Last 30 days" reads "3%" and "All time" reads "1%"

  # --- Stats: weekly goals ---

  @happy-path
  Scenario: A weekly goal shows weeks-in-a-row, best run, rates and total logs
    Given "Peloton ride" (3 per week) was created on 2026-09-13 and met the weeks of 2026-09-13, 2026-09-20 and 2026-10-04 but not 2026-09-27
    And it has 1 log this week
    When I open its page
    Then "Current streak" reads "1 week"
    And "Best streak" reads "2 weeks"
    And "Last 12 weeks" reads "75%"
    And "Total" equals the number of logs

  @edge-case
  Scenario: A goal is judged by the target in force each week
    Given "Peloton ride" was 2 per week before 2026-10-04 and 4 per week from then
    And it had 2 logs in the week of 2026-09-27 and 3 logs in the week of 2026-10-04
    Then the week of 2026-09-27 counts as met and the week of 2026-10-04 as not met

  # --- Calendar and backfill ---

  @happy-path
  Scenario: The calendar shows this month with done days marked
    Given "Meditate" was done on 2026-10-12 and 2026-10-13
    When I open its page
    Then a calendar headed "October 2026" starts its rows on Sunday
    And the buttons "October 12, done" and "October 13, done" have aria-pressed "true"
    And the button "October 11, not done" has aria-pressed "false"

  @happy-path
  Scenario: Backfilling a missed day fixes the streak
    Given "Meditate" was done on 2026-10-12 and 2026-10-14 but not 2026-10-13
    When I tap "October 13, not done" on its page
    Then the button reads "October 13, done"
    And "Current streak" reads "3 days"
    And Today shows "Meditate" with the badge "3 day streak"
    And storage holds a completion for 2026-10-13

  @happy-path
  Scenario: Tapping a done past day un-marks it
    Given "Meditate" was done on 2026-10-13
    When I tap "October 13, done"
    Then the button reads "October 13, not done" and storage holds no completion for 2026-10-13

  @happy-path
  Scenario: Earlier months can be backfilled
    When I tap "Previous month"
    Then the calendar is headed "September 2026"
    When I tap "September 30, not done"
    Then storage holds a completion for 2026-09-30

  @edge-case
  Scenario: Future days and future months are locked
    Then the button "October 15" is disabled
    And the "Next month" button is disabled while October 2026 is shown

  @happy-path
  Scenario: Backfilling a weekly goal adds or removes one log for that day
    Given "Peloton ride" has no logs on 2026-10-12
    When I tap "October 12, 0 logs"
    Then the button reads "October 12, 1 log" and the week shows 1 of 3
    When I tap "October 12, 1 log"
    Then the button reads "October 12, 0 logs"

  @edge-case
  Scenario: A day with two logs loses one per tap
    Given "Peloton ride" has 2 logs on 2026-10-12
    When I tap "October 12, 2 logs"
    Then the button reads "October 12, 1 log"

  @error
  Scenario: A failed backfill is undone on screen and reported
    Given IndexedDB rejects the next write
    When I tap "October 13, not done"
    Then the button returns to "October 13, not done"
    And the message "Couldn't save. Your phone may be out of storage." is shown

  @error
  Scenario: The repository refuses future days
    When a completion for "2026-10-15" is saved for "Meditate"
    Then the result is the error "Pick a day that isn't in the future" and nothing is stored

  # --- Heatmap ---

  @happy-path
  Scenario: The heatmap covers the last 26 weeks ending this week
    Given "Meditate" was done on 2026-10-01 to 2026-10-05 and 2026-10-12 to 2026-10-14
    When I open its page
    Then the heatmap has 26 columns of 7 days, Sunday at the top, the last column holding 2026-10-11 to 2026-10-17
    And its label reads "Last 6 months: 8 of 179 days done"

  @edge-case
  Scenario: Future days in this week are blank in the heatmap
    Then the heatmap cells for 2026-10-15 to 2026-10-17 are marked "future"

  @edge-case
  Scenario: Weekly goal heatmap shades by logs per day
    Given "Peloton ride" has 1 log on 2026-10-12 and 2 logs on 2026-10-13
    Then the heatmap cell for 2026-10-12 has level 1 and the cell for 2026-10-13 has level 2

  # --- Editing from the page ---

  @happy-path
  Scenario: Edit opens the same sheet and saves
    When I tap "Edit" on "Meditate"'s page and rename it "Meditate 10 min"
    Then the heading reads "Meditate 10 min"

  @happy-path
  Scenario: Deleting from the page goes back
    Given I opened "Meditate" from Today
    When I tap "Edit", then "Delete" twice
    Then the URL hash is "#/today" and "Meditate" is not on Today

  # --- New day ---

  @edge-case
  Scenario: The page rolls over at midnight
    Given "Meditate"'s page is open at "2026-10-14 23:59:50" and today is done
    When the clock passes midnight
    Then "October 15" is enabled and "Current streak" still reads the streak through 2026-10-14

  # --- Security ---

  @security
  Scenario: Names with HTML are plain text on the detail page
    Given the daily habit "<img src=x onerror=alert(1)>"
    When I open its page
    Then the heading text is literal and 0 img elements are on the page

  @security
  Scenario: An item id in the URL is never inserted as HTML
    When I open "#/item/%3Cimg%20src%3Dx%3E"
    Then the "This habit no longer exists" message is shown and 0 img elements are on the page

  # --- Performance ---

  @performance
  Scenario: Three years of history stays fast
    Given a daily habit done on 1000 days and a weekly goal with 600 logs over 3 years
    When the stats, the month grid and the heatmap are computed for each
    Then each computation finishes under 50 ms

  # --- Integration ---

  @integration
  Scenario: Backfill on the page shows on Today and the list page
    Given "Meditate"'s page is open
    When I backfill 2026-10-13 and tap "Back"
    Then Today shows "Meditate" with its streak including 2026-10-13 without a reload

  @integration
  Scenario: Backfill survives a reload
    When I backfill 2026-10-13, wait for it to be stored, and reload "#/item/<Meditate's id>"
    Then "October 13, done" has aria-pressed "true"

  # --- Accessibility ---

  @accessibility
  Scenario: Calendar days and month buttons are large enough and labelled
    Then each calendar day button is at least 40 by 40 CSS pixels and named "<Month> <day>, <state>"
    And the heatmap is one image with a text label, not 182 separate controls

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the slice's code
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then new repository methods return Result<T> and never throw for expected failures
    And the page stops watching the clock when it goes away

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then streak, rate, calendar and heatmap rules live in src/domain and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
