# Upcoming tab: Memento plan node 154f6895 (sub-idea 21ff98e5) / scenario set 5a94ecd9
# User request 2026-11-01: "add a tab that has all of the upcoming items so I can toggle between
# today and all of the items at a glance". Choices: every open to-do by date; "Upcoming", after Today;
# each row shows its list's emoji and name.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Sunday 2026-11-01 in America/Chicago.

Feature: Upcoming tab
  As a habit tracker user,
  I need one tab listing every open to-do from all my lists by date
  so that I can flip between Today and everything coming up at a glance.

  Background:
    Given the lists "Health 💪", "Home 🏡" and "Work 💼"

  # --- Tab bar ---

  @happy-path
  Scenario: The tab bar has Upcoming after Today
    When I open the app
    Then the tab bar shows "Today", "Upcoming", "History" and "Lists" in that order

  @happy-path
  Scenario: Tapping Upcoming opens the Upcoming page and marks the tab
    When I tap "Upcoming"
    Then the address ends in "#/upcoming", the heading "Upcoming" is shown and the "Upcoming" tab is the current page

  @happy-path
  Scenario: Tapping Today flips back
    Given I am on Upcoming
    When I tap "Today"
    Then the heading "Today" is shown and the "Today" tab is the current page

  # --- Grouping ---

  @happy-path
  Scenario: Open to-dos are grouped by date
    Given these open to-dos:
      | title            | list   | due        |
      | Renew licence    | Work   | 2026-10-29 |
      | Pay the plumber  | Home   | 2026-11-01 |
      | Book physio      | Health | 2026-11-02 |
      | Send report      | Work   | 2026-11-05 |
      | Plan holiday     | Home   | 2026-11-20 |
      | Buy light bulbs  | Home   |            |
    When I open Upcoming
    Then the sections are "Overdue", "Today", "Tomorrow", "This week", "Later" and "No date" in that order
    And "Renew licence" is under "Overdue", "Pay the plumber" under "Today", "Book physio" under "Tomorrow", "Send report" under "This week", "Plan holiday" under "Later" and "Buy light bulbs" under "No date"

  @happy-path
  Scenario: Each row shows its list's emoji and name
    Given the open to-do "Pay the plumber" in "Home" due 2026-11-01
    When I open Upcoming
    Then the row "Pay the plumber" shows "🏡 Home"

  @happy-path
  Scenario: Rows keep their due label and note
    Given the open to-do "Send report" in "Work" due 2026-11-05 with the note "Q3 numbers"
    When I open Upcoming
    Then the row shows "Thu" and "Q3 numbers"

  @edge-case
  Scenario: Within a section, the earliest due comes first across lists
    Given the open to-dos "Send report" in "Work" due 2026-11-05 and "Call vet" in "Home" due 2026-11-03
    When I open Upcoming
    Then "This week" lists "Call vet" before "Send report"

  @edge-case
  Scenario: Six days ahead is This week and seven days ahead is Later
    Given the open to-dos "Six" due 2026-11-07 and "Seven" due 2026-11-08
    When I open Upcoming
    Then "Six" is under "This week" and "Seven" is under "Later"

  @edge-case
  Scenario: Sections with nothing in them are left out
    Given the only open to-do is "Buy light bulbs" with no date
    When I open Upcoming
    Then the only section is "No date"

  @edge-case
  Scenario: Habits, weekly goals and finished to-dos are not on Upcoming
    Given the daily habit "Stretch", the weekly goal "Peloton ride" and the completed to-do "Old task"
    When I open Upcoming
    Then none of "Stretch", "Peloton ride" or "Old task" is shown

  @edge-case
  Scenario: With nothing open, Upcoming says so
    Given there are no open to-dos
    When I open Upcoming
    Then it shows "Nothing coming up. Tap + to add a to-do."

  @edge-case
  Scenario: The groups move on at midnight
    Given the open to-do "Book physio" due 2026-11-02 is under "Tomorrow"
    When the clock passes midnight into 2026-11-02 while Upcoming is open
    Then "Book physio" is under "Today"

  # --- Acting on rows ---

  @happy-path
  Scenario: Ticking a to-do off lingers, then it leaves Upcoming
    Given the open to-do "Book physio" due 2026-11-02
    When I tick "Book physio" on Upcoming
    Then it stays checked in place for a moment, then is gone from Upcoming and is in its list's Completed section

  @happy-path
  Scenario: Untick during the linger keeps it
    Given I just ticked "Book physio" on Upcoming
    When I tap it again before it leaves
    Then "Book physio" stays on Upcoming unchecked

  @happy-path
  Scenario: Tapping a name opens Edit and a new date moves it
    Given the open to-do "Plan holiday" due 2026-11-20
    When I tap "Edit Plan holiday", set the due date to 2026-11-02 and tap "Save"
    Then "Plan holiday" is under "Tomorrow"

  @happy-path
  Scenario: Adding from Upcoming starts a to-do
    When I tap "+" on Upcoming, type "Get stamps" and tap "Save"
    Then "Get stamps" is shown under "Today" (a new to-do is due today) with its list's name

  @error
  Scenario: A tick that can't be saved is reported
    Given IndexedDB rejects the next write
    When I tick "Book physio" on Upcoming
    Then "Couldn't save. Your phone may be out of storage." is shown and "Book physio" is unchecked

  @edge-case
  Scenario: To-dos in a deleted list are not shown
    Given the open to-do "Send report" in "Work" and "Work" is deleted
    When I open Upcoming
    Then "Send report" is not shown

  # --- Accessibility and safety ---

  @custom-accessibility
  Scenario: Each section is a labelled region and the checkbox keeps the to-do's name
    When I open Upcoming with to-dos due today and tomorrow
    Then there are regions named "Today" and "Tomorrow", and the checkbox for "Book physio" is named "Book physio"

  @security
  Scenario: List names stay plain text on Upcoming
    Given a list named "<img src=x onerror=alert(1)>" with an open to-do
    When I open Upcoming
    Then the list name shows as text and no image element is created

  # --- Integration and performance ---

  @integration
  Scenario: To-dos from the assistant appear on Upcoming
    Given the assistant sends the to-do "Dentist" for "Health" due 2026-11-10
    When the sync finishes while Upcoming is open
    Then "Dentist" is under "Later" with "💪 Health"

  @performance
  Scenario: Upcoming with 500 open to-dos opens without a visible wait
    Given 500 open to-dos spread over every section
    When I open Upcoming
    Then all 500 rows are visible with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then ticking a to-do on Upcoming goes through the repository's Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the date grouping lives in src/domain/today.ts as a pure function, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
