# S8 polish: Memento plan node 00854c6f / sub-idea a71715d1 / scenario set 97b14b31
# User picks 2026-10-12: Recently deleted, reorder items in a list, Clear completed to-dos,
# light/dark and accessibility pass.
# Supersedes s5c-drag-reorder-and-due-today.feature's "no buttons named Move Fitness up": the
# Move buttons return, visually hidden, for VoiceOver users only.
# Today is Wednesday 2026-10-14 in America/Chicago unless a scenario says otherwise.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Polish: undo deletes, tidy lists, your own order, readable everywhere
  As a habit tracker user and family member,
  I need deleted items to be recoverable, finished to-dos to be clearable, habits in my own order and every screen readable in light, dark, large text and VoiceOver
  so that mistakes are undoable and the app stays comfortable to use every day.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Wednesday "2026-10-14"

  # --- Recently deleted ---

  @happy-path
  Scenario: Deleted items are listed newest first
    Given "Meditate" (daily, Personal) was deleted on 2026-10-12 and "Call mom" (to-do, Personal) on 2026-10-13
    When I tap "Recently deleted" on the Lists tab
    Then the URL hash is "#/deleted" and a heading "Recently deleted" is shown with a "Lists" back link
    And the rows read "Call mom", "To-do · Personal · Deleted Oct 13" then "Meditate", "Daily habit · Personal · Deleted Oct 12"

  @happy-path
  Scenario: Restoring a habit brings it back with its streak
    Given "Meditate" was done on 2026-10-12 to 2026-10-14 and then deleted
    When I tap "Restore Meditate"
    Then the message "Restored “Meditate”." is shown and "Meditate" leaves the page
    And Today shows "Meditate" under "Personal" with the badge "3 day streak"
    And it is placed after the list's other habits and goals

  @happy-path
  Scenario: A restored completed to-do goes back to Completed
    Given the completed to-do "Pay rent" was deleted
    When I tap "Restore Pay rent"
    Then the "Personal" list page shows "Completed (1)" containing "Pay rent"

  @edge-case
  Scenario: An item whose list was deleted is restored to the first list
    Given the list "Side Business" was deleted, archiving "Post on Instagram"
    When I tap "Restore Post on Instagram"
    Then it is restored into "Fitness", the first list
    And the message "Restored “Post on Instagram” to Fitness because its list was deleted." is shown

  @edge-case
  Scenario: Restoring needs a list to put it in
    Given every list was deleted and "Meditate" is in Recently deleted
    When I tap "Restore Meditate"
    Then the message "Create a list first, then restore." is shown and "Meditate" stays deleted

  @edge-case
  Scenario: An empty Recently deleted page says so
    When I open "#/deleted" with nothing deleted
    Then the message "Nothing deleted." is shown

  @error
  Scenario: A restore that can't be saved is reported
    Given IndexedDB rejects the next write
    When I tap "Restore Meditate"
    Then the message "Couldn't save. Your phone may be out of storage." is shown and "Meditate" is still listed

  # --- Clear completed ---

  @happy-path
  Scenario: Clearing completed to-dos asks first
    Given "Personal" has 3 completed to-dos
    When I open its page and tap "Clear completed"
    Then an alert dialog says "Clear 3 completed to-dos? You can restore them from Recently deleted." with "Cancel" and "Clear"

  @happy-path
  Scenario: Clear moves them to Recently deleted
    Given the clear confirmation for 3 completed to-dos is shown
    When I tap "Clear"
    Then the Completed section is gone from the "Personal" page
    And Recently deleted lists the 3 to-dos
    And open to-dos and habits in "Personal" are unchanged

  @edge-case
  Scenario: Cancel keeps the completed to-dos
    Given the clear confirmation is shown
    When I tap "Cancel"
    Then "Completed (3)" is still shown and nothing is archived

  @edge-case
  Scenario: Clearing only touches this list
    Given "Work" also has 2 completed to-dos
    When I clear completed in "Personal"
    Then "Work" still shows "Completed (2)"

  @error
  Scenario: A clear that can't be saved is reported
    Given IndexedDB rejects the next write
    When I confirm "Clear"
    Then the message "Couldn't save. Your phone may be out of storage." is shown and "Completed (3)" is still shown

  # --- Reorder items in a list ---

  @happy-path
  Scenario: Edit on a list page shows handles for habits and goals
    Given "Fitness" has the daily habit "Stretch", the weekly goal "Peloton ride" and the to-do "Buy shoes"
    When I open the "Fitness" page and tap "Edit"
    Then the buttons "Reorder Stretch" and "Reorder Peloton ride" are shown and no "Reorder Buy shoes"
    And the "Edit" button reads "Done"

  @happy-path
  Scenario: Dragging a habit reorders it on the page and on Today
    Given the "Fitness" page is in Edit mode with "Stretch" above "Peloton ride"
    When I drag "Reorder Peloton ride" up by one row and let go
    Then the page lists "Peloton ride" above "Stretch"
    And after tapping "Done" and opening Today, the "Fitness" group lists "Peloton ride" then "Stretch"
    And the order survives a reload

  @edge-case
  Scenario: Arrow keys and VoiceOver Move buttons reorder items too
    Given the "Fitness" page is in Edit mode with "Stretch" above "Peloton ride"
    When I activate the visually hidden button "Move Peloton ride up"
    Then "Peloton ride" is listed above "Stretch"
    And no "Move Peloton ride up" button exists while it is first

  @error
  Scenario: A reorder that can't be saved puts the order back
    Given IndexedDB rejects the next write
    When I move "Peloton ride" up
    Then the order returns to "Stretch", "Peloton ride" and the save message is shown

  # --- VoiceOver on list reordering ---

  @happy-path
  Scenario: Lists can be reordered without dragging
    Given I am in Edit mode on the Lists tab
    When I activate the visually hidden button "Move Work down"
    Then the lists are ordered "Fitness", "Side Business", "Work", "Personal"
    And the buttons have no visible size until focused, and at least 44 by 44 CSS pixels when focused

  # --- Light, dark and large text ---

  @happy-path
  Scenario Outline: Every screen passes automated accessibility checks
    Given the colour scheme is "<scheme>"
    When I open each of Today, Lists, Lists in Edit mode, a list page with Completed open, a habit page, Recently deleted, the New habit sheet and the restore confirmation
    Then axe-core reports 0 violations of WCAG 2.1 A and AA rules on each

    Examples:
      | scheme |
      | light  |
      | dark   |

  @edge-case
  Scenario: Large text never makes the page scroll sideways
    Given the root text size is 28 CSS pixels
    When I open each main screen
    Then the page is no wider than the screen and every row's text wraps instead of being cut off

  @edge-case
  Scenario: Text follows the iPhone text-size setting only on iOS
    Then the stylesheet sets "font: -apple-system-body" on html only inside "@supports (-webkit-touch-callout: none)"
    And keeps the app's own font family

  # --- Security ---

  @security
  Scenario: Deleted names are plain text on Recently deleted
    Given a deleted habit named "<img src=x onerror=alert(1)>"
    When I open Recently deleted
    Then its name is literal and 0 img elements exist

  # --- Performance ---

  @performance
  # Revised 2026-10-12 alongside the restore timing: CI browsers' storage is several times slower
  # than a phone's, so CI records the time and fails only past 5 seconds.
  Scenario: Many deleted items stay quick
    Given 500 deleted items
    When Recently deleted opens
    Then all 500 rows are shown, within 5 seconds in the CI browsers, with the time recorded

  # --- Integration ---

  @integration
  Scenario: Cleared and restored items survive a backup round trip
    Given I cleared 2 completed to-dos and restored 1 deleted habit
    When I export a backup and restore it
    Then Recently deleted lists the same 2 to-dos and Today shows the restored habit

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the slice's code
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then restore, clearCompleted and moveTo return Result<T> and never throw for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then ordering and deleted-item rules live in src/domain, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
