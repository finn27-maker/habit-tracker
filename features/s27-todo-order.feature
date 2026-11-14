# To-dos in your own order on a list page: Memento plan node f62c3c1f / scenario set 62a47f33
# Owner's choice 2026-11-14: "Drag on list page" - drag to-dos in a list's Edit mode with the same
# handle as habits; that order is used on the list page; Today and Upcoming stay sorted by date;
# new to-dos go to the bottom. A list keeps date order until its first to-do drag, which starts
# from the order on screen, so nothing jumps when this ships.
# Amends s8-polish "To-dos follow their due dates" hint and s5 list-page sorting.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Wednesday 2026-10-14. The list "Biz Lending Strategy" has open to-dos
# "Send term sheet" (due today), "Call the bank" (due 2026-10-20) and "Update pitch deck" (no date).

Feature: To-dos in my own order on a list page
  As a habit tracker user,
  I need to drag to-dos into my own order on a list's page
  so that each list reads in the order I actually work it.

  # --- Edit mode ---

  @happy-path
  Scenario: Edit mode shows the open to-dos with drag handles
    When I open "Biz Lending Strategy" and tap "Edit"
    Then a "To-dos" group lists "Send term sheet", "Call the bank" and "Update pitch deck" in that order, each with a "Reorder" handle

  @happy-path
  Scenario: Edit appears for a list with two to-dos and no habits
    Given a list with 2 open to-dos and no habits or goals
    When I open it
    Then the "Edit" button is shown

  @happy-path
  Scenario: Edit stays hidden with nothing to reorder
    Given a list with 1 open to-do and 1 habit
    When I open it
    Then no "Edit" button is shown

  @happy-path
  Scenario: Dragging a to-do changes the list page order
    When I drag "Update pitch deck" to the top in Edit mode and tap "Done"
    Then the list page shows "Update pitch deck", "Send term sheet", "Call the bank" in that order

  @happy-path
  Scenario: Move up and down by keyboard
    When I focus the handle for "Call the bank" and press Arrow Up
    Then "Call the bank" moves above "Send term sheet" and the move is announced

  @happy-path
  Scenario: The order survives a reload
    Given I dragged "Update pitch deck" to the top
    When I reload the app and open the list
    Then the list page still shows "Update pitch deck" first

  # --- Where the order applies ---

  @happy-path
  Scenario: Today keeps date order
    Given I dragged "Update pitch deck" to the top
    When I open Today
    Then under "Biz Lending Strategy" "Send term sheet" (due today) comes before "Update pitch deck" (no date)

  @happy-path
  Scenario: Upcoming keeps date sections
    Given I dragged "Update pitch deck" to the top
    When I open Upcoming
    Then "Send term sheet" is under "Today", "Call the bank" under "This week" and "Update pitch deck" under "No date"

  @happy-path
  Scenario: Habits and goals keep their own order above to-dos
    Given the list also has habits "Read" and "Stretch"
    When I reorder to-dos
    Then the list page shows "Read" and "Stretch" first in their saved order, then the to-dos in my order

  # --- Lists never reordered ---

  @edge-case
  Scenario: A list I never reordered stays in date order
    Given I have never dragged a to-do in "Personal"
    When I open "Personal"
    Then its to-dos are sorted by due date, undated last, exactly as before this update

  @edge-case
  Scenario: The first drag starts from the order on screen
    Given "Biz Lending Strategy" shows "Send term sheet", "Call the bank", "Update pitch deck" by date
    When I drag "Call the bank" to the bottom
    Then the list shows "Send term sheet", "Update pitch deck", "Call the bank"

  @edge-case
  Scenario: Reordering one list leaves other lists in date order
    Given I reordered "Biz Lending Strategy"
    When I open "Personal"
    Then "Personal" is still sorted by due date

  # --- New, changed and finished to-dos ---

  @edge-case
  Scenario: A new to-do goes to the bottom of a reordered list
    Given I reordered "Biz Lending Strategy"
    When I add "Email the lender" due today
    Then it appears last on the list page, below "Call the bank"

  @edge-case
  Scenario: A to-do from the assistant goes to the bottom of a reordered list
    Given I reordered "Biz Lending Strategy"
    When the assistant delivers "Review terms" for that list
    Then it appears last on the list page

  @edge-case
  Scenario: Changing a due date doesn't move a to-do in a reordered list
    Given I reordered "Biz Lending Strategy"
    When I change "Update pitch deck" to be due today
    Then it keeps its place on the list page, and Today shows it in date order

  @edge-case
  Scenario: A finished to-do leaves the order and comes back at its old place
    Given I reordered "Biz Lending Strategy" to "Update pitch deck", "Send term sheet", "Call the bank"
    When I tick "Send term sheet" and later untick it from Completed
    Then the list shows "Update pitch deck", "Send term sheet", "Call the bank" again

  @edge-case
  Scenario: Completed to-dos are not in the reorder group
    Given "Biz Lending Strategy" has a completed to-do "Old task"
    When I tap "Edit"
    Then "Old task" has no handle and the "To-dos" group lists only open to-dos

  @edge-case
  Scenario: A to-do moved to another list goes to the bottom there
    Given I reordered "Personal"
    When I move "Call the bank" to "Personal" in Edit
    Then it is last on the "Personal" page

  @edge-case
  Scenario: A to-do changed into a habit leaves the to-do order
    When I change "Update pitch deck" into a daily habit
    Then it appears among the habits and the remaining to-dos keep their order

  @edge-case
  Scenario: Dragging past the ends is clamped
    When I drag "Send term sheet" above the first row or below the last row
    Then it ends up first or last, never outside the group

  # --- Errors and accessibility ---

  @error
  Scenario: A drag that can't be saved is undone and reported
    Given IndexedDB rejects the next write
    When I drag "Update pitch deck" to the top
    Then the order goes back to how it was and "Couldn't save. Your phone may be out of storage." is shown

  @error
  Scenario: A to-do that no longer exists can't be moved
    Given "Update pitch deck" was deleted on another screen
    When a move for it is saved
    Then nothing changes and no error is thrown

  @custom-accessibility
  Scenario: Handles are named and big enough
    Then each to-do handle is named "Reorder Send term sheet" and so on, is at least 44 by 44 pixels, and the "To-dos" group has a heading

  @custom-accessibility
  Scenario: The hint explains where the order applies
    When I tap "Edit"
    Then the hint reads "Drag ☰ to put habits, goals and to-dos in order. Today and Upcoming still sort to-dos by date."

  # --- Security, integration and performance ---

  @security
  Scenario: To-do titles stay plain text in Edit mode
    Given a to-do titled "<img src=x onerror=alert(1)>"
    When I tap "Edit"
    Then the title shows as text and no image element is created

  @integration
  Scenario: The order and the list's choice survive a backup and restore
    Given I reordered "Biz Lending Strategy"
    When I export a backup and restore it
    Then the list page shows my order and the list still uses it

  @integration
  Scenario: A backup from before this update restores in date order
    Given a backup file with no to-do ordering
    When I restore it
    Then every list shows its to-dos by date

  @performance
  Scenario: Reordering a list with 300 to-dos saves without a visible wait
    Given a list with 300 open to-dos
    When I move one from the bottom to the top
    Then the move is saved in under 1 second in the unit test and the page shows it first

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then every to-do move goes through the items repository's Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the ordering rules live in src/domain/order.ts and src/domain/today.ts, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
