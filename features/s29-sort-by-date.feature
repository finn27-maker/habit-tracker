# Sort by date on a list page: Memento plan node 3ca4fea2 / scenario set 551ab537
# Owner's choice 2026-11-17: "let's do sort by date fix" - a list switched to its own to-do order
# (s27) can be put back to due-date order with one tap instead of dragging every to-do.
# The button lives in the list page's Edit mode beside the To-dos it reorders, and only shows
# when the list is in its own order and has two or more open to-dos. No confirmation: it is
# one tap in Edit mode, says what it did, and Today and Upcoming are never affected.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Wednesday 2026-10-14. The list "Biz Lending Strategy" has open to-dos
# "Send term sheet" (due today), "Call the bank" (due 2026-10-20) and "Update pitch deck" (no date),
# dragged into the order "Update pitch deck", "Call the bank", "Send term sheet".

Feature: Sort a list's to-dos by date again
  As a habit tracker user,
  I need to put a list I ordered by hand back into due-date order with one tap
  so that I don't have to drag every to-do back after the dates change.

  # --- Showing the button ---

  @happy-path
  Scenario: Sort by date shows for a list in its own to-do order
    When I open "Biz Lending Strategy" and tap "Edit"
    Then a "Sort by date" button is shown under the "To-dos" group

  @happy-path
  Scenario: Sort by date is hidden for a list still in date order
    Given a list with 3 open to-dos that has never had a to-do dragged
    When I open it and tap "Edit"
    Then no "Sort by date" button is shown

  @edge-case
  Scenario: Sort by date is hidden with fewer than two open to-dos
    Given a list in its own to-do order with 1 open to-do
    When I open it and tap "Edit"
    Then no "Sort by date" button is shown

  @edge-case
  Scenario: Sort by date is hidden outside Edit mode
    When I open "Biz Lending Strategy" without tapping "Edit"
    Then no "Sort by date" button is shown

  # --- Sorting ---

  @happy-path
  Scenario: Sort by date puts the to-dos back in due-date order
    When I open "Biz Lending Strategy", tap "Edit" and tap "Sort by date"
    Then the "To-dos" group lists "Send term sheet", "Call the bank" and "Update pitch deck" in that order
    And the message "To-dos sorted by date." is announced

  @happy-path
  Scenario: The button goes away once the list is in date order
    When I tap "Sort by date" on "Biz Lending Strategy"
    Then no "Sort by date" button is shown

  @happy-path
  Scenario: The list page shows date order after Done
    When I tap "Sort by date" on "Biz Lending Strategy" and tap "Done"
    Then the list page shows "Send term sheet", "Call the bank" and "Update pitch deck" in that order

  @happy-path
  Scenario: Date order survives closing the app
    When I tap "Sort by date" on "Biz Lending Strategy" and reload the app
    Then the list page shows "Send term sheet", "Call the bank" and "Update pitch deck" in that order

  @happy-path
  Scenario: New dates keep the list sorted after the reset
    Given I tapped "Sort by date" on "Biz Lending Strategy"
    When I change "Update pitch deck" to be due 2026-10-15
    Then the list page shows "Send term sheet", "Update pitch deck" and "Call the bank" in that order

  @happy-path
  Scenario: Overdue to-dos come first after the reset
    Given "Call the bank" is due 2026-10-12, which is overdue
    When I tap "Sort by date" on "Biz Lending Strategy"
    Then "Call the bank" is listed first and shown as overdue

  @happy-path
  Scenario: Dragging again starts from date order
    Given I tapped "Sort by date" on "Biz Lending Strategy"
    When I drag "Update pitch deck" to the top
    Then the "To-dos" group lists "Update pitch deck", "Send term sheet" and "Call the bank" in that order
    And the "Sort by date" button is shown again

  @edge-case
  Scenario: To-dos with the same date keep a steady order
    Given "Call the bank" and "Send term sheet" are both due today
    When I tap "Sort by date" on "Biz Lending Strategy"
    Then both are listed before "Update pitch deck" and their order is the same each time the page opens

  @edge-case
  Scenario: Several undated to-dos stay together at the bottom
    Given "Update pitch deck" and "Email the lawyer" have no date
    When I tap "Sort by date" on "Biz Lending Strategy"
    Then both undated to-dos are listed after every dated to-do

  # --- What it leaves alone ---

  @edge-case
  Scenario: Habits and goals keep their order
    Given "Biz Lending Strategy" also has habits "Review pipeline" then "Call one lead" in my own order
    When I tap "Sort by date"
    Then the "Habits and goals" group still lists "Review pipeline" then "Call one lead"

  @edge-case
  Scenario: Completed to-dos are unaffected
    Given "Biz Lending Strategy" has 2 completed to-dos
    When I tap "Sort by date"
    Then the "Completed (2)" section still shows the same 2 to-dos

  @edge-case
  Scenario: Other lists keep their own order
    Given "KeyBank" is also in its own to-do order
    When I tap "Sort by date" on "Biz Lending Strategy"
    Then "KeyBank" still lists its to-dos in my own order

  @integration
  Scenario: Today and Upcoming are unchanged
    When I tap "Sort by date" on "Biz Lending Strategy"
    Then Today and Upcoming list the same to-dos in the same date order as before

  @integration
  Scenario: New to-dos go by date after the reset
    Given I tapped "Sort by date" on "Biz Lending Strategy"
    When I add "Sign the lease" due 2026-10-16
    Then the list page lists it between "Send term sheet" and "Call the bank"

  @integration
  Scenario: Assistant to-dos land in date order after the reset
    Given I tapped "Sort by date" on "Biz Lending Strategy"
    When the assistant delivers "Send the tax return" due 2026-10-14 to that list
    Then it is listed among the to-dos due today, before "Call the bank"

  @integration
  Scenario: A backup keeps the list in date order
    Given I tapped "Sort by date" on "Biz Lending Strategy"
    When I export a backup and later replace everything with it
    Then "Biz Lending Strategy" shows its to-dos in date order

  @integration
  Scenario: A backup made before the reset brings back my own order
    Given a backup made while "Biz Lending Strategy" was in my own order
    When I replace everything with that backup
    Then "Biz Lending Strategy" shows "Update pitch deck", "Call the bank" and "Send term sheet" in that order and the "Sort by date" button shows in Edit

  # --- Errors ---

  @error
  Scenario: A failed save puts my own order back
    Given the phone's storage refuses the change
    When I tap "Sort by date" on "Biz Lending Strategy"
    Then the "To-dos" group goes back to "Update pitch deck", "Call the bank" and "Send term sheet"
    And the message "Couldn't save. Try again." is shown

  @error
  Scenario: Sorting a list that was deleted meanwhile changes nothing
    Given "Biz Lending Strategy" was deleted in another tab
    When I tap "Sort by date"
    Then no list is created or changed and the page says "List not found"

  # --- Accessibility ---

  @happy-path
  Scenario: The button is easy to reach and read
    Then the "Sort by date" button is at least 44 by 44 points, is reachable with Tab, and passes axe in light and dark mode

  @edge-case
  Scenario: Large text keeps the button on screen
    Given the largest text size
    When I open "Biz Lending Strategy" and tap "Edit"
    Then the "Sort by date" button is fully visible without scrolling sideways

  # --- Security ---

  @security
  Scenario: Sorting only changes the list's order setting
    When I tap "Sort by date" on "Biz Lending Strategy"
    Then only that list's to-do order setting changes and no to-do's title, date, notes or list changes

  # --- Performance ---

  @performance
  Scenario: Sorting 200 to-dos is instant
    Given "Biz Lending Strategy" has 200 open to-dos in my own order
    When I tap "Sort by date"
    Then the date order is shown in under 1 second in the browser test

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the reset goes through the lists repository's Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the date order rule stays in src/domain/today.ts and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
