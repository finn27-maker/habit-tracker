# S5 follow-up: Memento plan node 1f12a194 / scenario set b14950b9
# User request 2026-10-11: "drag the list to change the order instead of pushing the up or down
# button" and "default the to-do as today and then let me select another date".
# Supersedes: s2-lists.feature "Move a list up and down", the disabled "Move Fitness up" edge case,
# the "Move List 50 up" performance step and the Move-button accessibility step; s5-todos.feature
# "A to-do has a Due choice" (default was "No date") and "Edit mode ... Move Work up".
# Today is Wednesday 2026-10-14 in America/Chicago. Starter lists: Fitness, Work, Side Business, Personal.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Drag lists into order and start to-dos on Today
  As a habit tracker user,
  I need to drag lists into order and have new to-dos start on Today
  so that arranging my lists takes one gesture and capturing today's tasks takes fewer taps.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Wednesday "2026-10-14"

  # --- Drag to reorder: happy path ---

  @happy-path
  Scenario: Edit mode shows a drag handle instead of move buttons
    When I tap "Edit" on the Lists tab
    Then each list row shows a button named "Reorder <list name>"
    And no buttons named "Move Fitness up" or "Move Fitness down" exist
    And the "Edit Fitness" and "Delete Fitness" buttons are still shown

  @happy-path
  Scenario: Drag a list down two places
    Given I am in Edit mode on the Lists tab
    When I drag the "Reorder Fitness" handle down by two rows and let go
    Then the lists are ordered "Work", "Side Business", "Fitness", "Personal"

  @happy-path
  Scenario: Drag a list to the top
    Given I am in Edit mode on the Lists tab
    When I drag the "Reorder Personal" handle up by three rows and let go
    Then the lists are ordered "Personal", "Fitness", "Work", "Side Business"

  @happy-path
  Scenario: A dragged order survives closing the app
    Given I dragged "Personal" to the top
    When I reload the page
    Then the Lists tab shows "Personal", "Fitness", "Work", "Side Business"
    And Today groups appear in that same order

  @happy-path
  Scenario: The row follows the finger while dragging
    Given I am in Edit mode on the Lists tab
    When I press the "Reorder Work" handle and move 30 pixels down without letting go
    Then the "Work" row is shifted 30 pixels down
    And storage still holds the original order

  @happy-path
  Scenario: Arrow keys on the handle reorder for keyboard users
    Given I am in Edit mode on the Lists tab
    When I focus "Reorder Side Business" and press ArrowUp
    Then the lists are ordered "Fitness", "Side Business", "Work", "Personal"
    When I press ArrowDown on "Reorder Side Business"
    Then the lists are ordered "Fitness", "Work", "Side Business", "Personal"

  # --- Drag to reorder: edge cases ---

  @edge-case
  Scenario: Dragging past the end stops at the last place
    Given I am in Edit mode on the Lists tab
    When I drag the "Reorder Fitness" handle down by ten rows and let go
    Then "Fitness" is the 4th and last list

  @edge-case
  Scenario: Dragging past the top stops at the first place
    Given I am in Edit mode on the Lists tab
    When I drag the "Reorder Work" handle up by ten rows and let go
    Then "Work" is the 1st list

  @edge-case
  Scenario: A tiny drag changes nothing
    Given I am in Edit mode on the Lists tab
    When I drag the "Reorder Work" handle down by 10 pixels and let go
    Then the order is unchanged and no write is made to storage

  @edge-case
  Scenario: ArrowUp on the first list changes nothing
    Given I am in Edit mode on the Lists tab
    When I press ArrowUp on "Reorder Fitness"
    Then the order is unchanged and no write is made to storage

  @edge-case
  Scenario: A cancelled touch puts the row back
    Given I am dragging the "Reorder Work" handle
    When the browser cancels the pointer
    Then the "Work" row is no longer shifted and the order is unchanged

  @edge-case
  Scenario: Outside Edit mode there is no handle and tapping a list opens it
    When I view the Lists tab without tapping "Edit"
    Then no button named "Reorder Fitness" exists
    And tapping "Personal" opens "#/list/<Personal's id>"

  @edge-case
  Scenario: The handle does not scroll the page while dragging
    Then the "Reorder Fitness" handle has CSS touch-action "none"

  # --- Drag to reorder: errors ---

  @error
  Scenario: A failed reorder save puts the old order back and says so
    Given IndexedDB rejects the next write
    When I drag "Personal" to the top
    Then the lists return to "Fitness", "Work", "Side Business", "Personal"
    And the message "Couldn't save. Your phone may be out of storage." is shown

  @error
  Scenario: Reordering a list deleted in another tab is refused
    Given "Work" was deleted after the Lists tab loaded
    When the repository is asked to move "Work" to place 1
    Then it returns the error "List not found" and no list order changes

  @error
  Scenario: A target place outside the list is clamped, not an error
    When the repository is asked to move "Fitness" to place 99
    Then "Fitness" is stored last with order values 0 to 3 kept distinct

  # --- Due defaults to Today ---

  @happy-path
  Scenario: A new to-do starts due Today
    When I tap "New habit" and set "Repeats" to "Once (to-do)"
    Then the "Due" selector shows "Today"
    And it still offers "No date", "Tomorrow" and "Pick a date"

  @happy-path
  Scenario: Saving without touching Due makes the to-do due today
    When I add the to-do "Call accountant" without changing "Due"
    Then "Call accountant" is shown on Today with the label "Today"
    And storage holds dueDate "2026-10-14" for it

  @happy-path
  Scenario: I can still choose another day
    When I add the to-do "Book flights" and set "Due" to "Pick a date" and pick "2026-10-20"
    Then "Book flights" is not on Today and its list page shows "Tue"

  @happy-path
  Scenario: I can still choose no date
    When I add the to-do "Clean garage" and set "Due" to "No date"
    Then "Clean garage" is on Today with no date label and storage has no dueDate

  @edge-case
  Scenario: Editing an undated to-do keeps it undated
    Given the to-do "Clean garage" has no due date
    When I tap "Edit Clean garage"
    Then the "Due" selector shows "No date"

  @edge-case
  Scenario: Editing a to-do due later keeps its date
    Given the to-do "Book flights" is due "2026-10-20"
    When I tap "Edit Book flights"
    Then the "Due" selector shows "Pick a date" and the "Date" field shows "2026-10-20"

  @edge-case
  Scenario: Daily habits and weekly goals ignore the Due default
    When I add the daily habit "Meditate"
    Then storage holds no dueDate for "Meditate"

  @edge-case
  Scenario: A to-do added just after midnight is due on the new day
    Given the app was opened at "2026-10-14 23:59:50" and the clock passes midnight
    When I add a to-do without changing "Due"
    Then storage holds dueDate "2026-10-15" for it

  # --- Security ---

  @security
  Scenario: List names with HTML stay plain text in the reorder handle label
    Given a list named "<img src=x onerror=alert(1)>"
    When I tap "Edit"
    Then a button named "Reorder <img src=x onerror=alert(1)>" exists and 0 img elements are on the page

  # --- Performance ---

  @performance
  Scenario: Reordering among a hundred lists is quick
    Given 100 lists
    When "List 50" is moved to place 1
    Then the new order is shown within 1 second
    And storage holds exactly 100 lists with distinct order values 0 to 99

  # --- Integration ---

  @integration
  Scenario: Today follows the new list order
    Given "Fitness" and "Personal" each have a habit
    When I drag "Personal" above "Fitness" and open Today
    Then the "Personal" group is shown before the "Fitness" group

  @integration
  Scenario: Reordering keeps each list's items
    Given "Work" has the to-do "Call accountant"
    When I drag "Work" to the bottom
    Then "Call accountant" is still shown under "Work" on Today

  # --- Accessibility ---

  @accessibility
  Scenario: The drag handle is large enough to grab
    Then each "Reorder <list name>" handle is at least 44 by 44 CSS pixels

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the new list-move repository method returns Result<List[]> and never throws for expected failures
    And a drag in progress is dropped without saving when the Lists screen goes away

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the move-to-place rule lives only in src/domain/lists.ts and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When the old one-step move code is no longer used by any screen
    Then it is removed in the same change rather than left as dead code
