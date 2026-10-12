# S5 to-dos: Memento plan node 1f12a194 / sub-idea 8578cb37 / scenario set c2920cac
# User choices: Today shows to-dos due today, overdue and undated; tap a list to open its page
# with a Completed section; checking off lingers a few seconds before moving; friendly due labels.
# Today is Wednesday 2026-10-14 in America/Chicago unless a scenario says otherwise.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: One-time to-dos
  As a habit tracker user,
  I need one-time to-dos with optional due dates and a Completed section
  so that I can replace my scattered lists and post-its.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Wednesday "2026-10-14"

  # --- Adding ---

  @happy-path
  Scenario: The Repeats choice offers a one-time to-do
    When I tap "New habit"
    Then the "Repeats" selector offers "Every day", "Times a week" and "Once (to-do)"

  @happy-path
  Scenario: A to-do has a Due choice instead of a weekly target
    When I set "Repeats" to "Once (to-do)"
    Then a "Due" selector shows "No date" and offers "Today", "Tomorrow" and "Pick a date"
    And no "Times per week" selector is shown

  @happy-path
  Scenario: Picking a date shows a date field that is already filled in
    When I set "Due" to "Pick a date"
    Then a "Date" field is shown with the value "2026-10-16"

  @happy-path
  Scenario: Add an undated to-do and see it on Today
    When I add the to-do "Clean garage" to "Personal" with no date
    Then a checkbox named "Clean garage" appears under the "Personal" header with no date label

  @happy-path
  Scenario: Add a to-do due today
    When I add the to-do "Call accountant" to "Work" due "Today"
    Then "Call accountant" is shown on Today with the label "Today"

  @edge-case
  Scenario: A future-dated to-do waits on its list page
    When I add the to-do "Book flights" to "Personal" due on "2026-10-20"
    Then no checkbox named "Book flights" is shown on Today
    And the "Personal" list page shows "Book flights" with the label "Oct 20"

  # --- Labels ---

  @edge-case
  Scenario Outline: Due dates read naturally
    Given a to-do is due on "<due>"
    Then its label is "<label>"

    Examples:
      | due        | label            |
      | 2026-10-14 | Today            |
      | 2026-10-15 | Tomorrow         |
      | 2026-10-16 | Fri              |
      | 2026-10-20 | Tue              |
      | 2026-10-21 | Oct 21           |
      | 2027-01-05 | Jan 5, 2027      |
      | 2026-10-13 | 1 day overdue    |
      | 2026-10-11 | 3 days overdue   |

  @edge-case
  Scenario: Overdue labels are shown in red
    Given the to-do "Renew license" was due on "2026-10-12"
    Then its label reads "2 days overdue" and is styled "overdue"

  # --- Ordering on Today ---

  @happy-path
  Scenario: To-dos come after habits, overdue first, then today, then undated
    Given "Personal" has the daily habit "Meditate"
    And the to-dos "Clean garage" (no date), "Call mom" (due today) and "Renew license" (due 2026-10-12)
    When I view Today
    Then the "Personal" rows read "Meditate", "Renew license", "Call mom", "Clean garage"

  @edge-case
  Scenario: Several overdue to-dos show the oldest first
    Given the to-dos "B" due "2026-10-12" and "A" due "2026-10-09"
    Then "A" is listed before "B"

  # --- Checking off ---

  @happy-path
  Scenario: Checking off a to-do shows a check, then it leaves Today
    Given the to-do "Clean garage" is on Today
    When I tap its circle
    Then its checkbox has aria-checked "true" right away
    And after 3 seconds it is no longer shown on Today
    And it has a completedAt timestamp in storage

  @happy-path
  Scenario: Tapping again during the pause undoes it
    Given I just checked off "Clean garage"
    When I tap its circle again within 3 seconds
    Then its checkbox has aria-checked "false"
    And it stays on Today after 3 seconds
    And it has no completedAt timestamp in storage

  @edge-case
  Scenario: A checked-off to-do stays gone after a reload
    Given I checked off "Clean garage" and 3 seconds passed
    When I reload the page
    Then no checkbox named "Clean garage" is shown on Today

  # --- List page ---

  @happy-path
  Scenario: Tapping a list opens its page
    When I tap "Personal" on the Lists tab
    Then the URL hash is "#/list/<Personal's id>"
    And a heading "Personal" is shown with a "Lists" back link

  @happy-path
  Scenario: The list page shows habits, goals and all open to-dos
    Given "Personal" has the daily habit "Meditate", the weekly goal "Read" and the to-dos "Book flights" (due 2026-10-20) and "Clean garage" (no date)
    When I open the "Personal" list page
    Then it shows "Meditate", "Read", "Book flights" and "Clean garage"
    And the to-dos dated sooner come first and undated ones last

  @happy-path
  Scenario: Completed to-dos are in a collapsed section
    Given "Personal" has 2 completed to-dos
    When I open the "Personal" list page
    Then a button reads "Completed (2)" with aria-expanded "false"
    When I tap it
    Then the 2 completed to-dos are shown, most recently completed first, with aria-checked "true"

  @happy-path
  Scenario: Unchecking a completed to-do restores it
    Given "Clean garage" is in the "Personal" Completed section
    When I tap its circle
    Then it moves to the open to-dos and the button reads "Completed (0)" or is hidden
    And it appears on Today again

  @edge-case
  Scenario: A list with nothing in it says so
    When I open the list page of a list with no items
    Then the message "Nothing in this list yet. Tap + to add something." is shown

  @edge-case
  Scenario: A deleted list's page says it was not found
    When I open "#/list/does-not-exist"
    Then the message "List not found" and a "Lists" back link are shown

  @happy-path
  Scenario: Adding from a list page starts in that list
    When I open the "Work" list page and tap "New habit"
    Then the "List" selector shows "💼 Work"

  @happy-path
  Scenario: Checking off on the list page works the same as on Today
    When I check off "Clean garage" on the "Personal" list page
    Then after 3 seconds "Completed (1)" is shown

  @edge-case
  Scenario: The Lists tab is highlighted on a list page
    When I open a list page
    Then the "Lists" tab has aria-current "page"

  @edge-case
  Scenario: Edit mode on the Lists screen still works and does not open pages
    Given I am in Edit mode on the Lists screen
    When I tap "Move Work up"
    Then no list page opens

  # --- Editing ---

  @happy-path
  Scenario: Tapping a to-do's name edits it
    When I tap the button named "Edit Clean garage"
    Then a dialog named "Edit to-do" shows the name, the list and "Due" set to "No date"

  @happy-path
  Scenario: Giving a to-do a future date moves it off Today
    When I edit "Clean garage" and pick the date "2026-10-20"
    Then it leaves Today and its list page shows the label "Tue"

  @happy-path
  Scenario: Removing a due date keeps the to-do on Today
    Given "Call mom" is due "2026-10-20"
    When I edit it and set "Due" to "No date"
    Then it appears on Today with no date label

  @happy-path
  Scenario: Deleting a to-do archives it
    When I edit "Clean garage" and tap "Delete" twice
    Then it leaves Today and its list page, including Completed
    And it has an archivedAt timestamp in storage

  # --- New day ---

  @edge-case
  Scenario: A future to-do appears on Today when its day comes
    Given "Book flights" is due "2026-10-15" and the app is open at "2026-10-14 23:59:50"
    When the clock passes midnight
    Then "Book flights" appears on Today with the label "Today"

  @edge-case
  Scenario: A due-today to-do becomes overdue the next day
    Given "Call mom" is due "2026-10-14" and the app is open at "2026-10-14 23:59:50"
    When the clock passes midnight
    Then its label reads "1 day overdue"

  # --- Validation ---

  @error
  Scenario: A to-do needs a name
    When I try to save a to-do with a blank name
    Then the alert "Name can't be empty" is shown

  @error
  Scenario: A picked date must be a real date
    When I try to save a to-do with the date "2026-02-30"
    Then the alert "Pick a valid date" is shown

  # --- Failures ---

  @error
  Scenario: A failed check-off is reverted and reported
    Given IndexedDB rejects the next write
    When I check off "Clean garage"
    Then its checkbox returns to aria-checked "false"
    And the message "Couldn't save. Your phone may be out of storage." is shown

  @error
  Scenario: A failed restore is reported
    Given IndexedDB rejects the next write
    When I uncheck a completed to-do on its list page
    Then the message "Couldn't save. Your phone may be out of storage." is shown and it stays in Completed

  # --- Integration ---

  @integration
  Scenario: Daily habits and weekly goals are unaffected by to-dos
    Given a list with a daily habit, a weekly goal and a to-do
    When I check off the to-do
    Then the habit's streak and the goal's count are unchanged

  @integration
  Scenario: Completing and restoring is stored, not just shown
    When I check off "Clean garage", wait 3 seconds and restore it from its list page
    Then storage shows completedAt removed

  # --- Security ---

  @security
  Scenario: To-do names with HTML are plain text on Today and on list pages
    Given the to-do "<img src=x onerror=alert(1)>" exists
    Then its text is literal on Today and on its list page and 0 img elements exist

  # --- Performance ---

  @performance
  Scenario: Many to-dos stay fast
    Given 200 to-dos and 100 completed to-dos across 4 lists
    When Today and a list page are computed
    Then each takes under 50 ms

  # --- Accessibility ---

  @accessibility
  Scenario: To-do controls are labelled and large enough
    Then each to-do circle is a checkbox named after the to-do and at least 44 by 44 CSS pixels
    And the name is a button named "Edit <name>"
    And the Completed toggle exposes aria-expanded

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the slice's code
    Then Vitest meets the tiered coverage thresholds and the full CI sequence passes locally before pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then new repository methods return Result<T>, never throw for expected failures, and the linger timers are cancelled on unmount

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then due-date and to-do ordering rules live only in src/domain/todos.ts and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
