# Empty Recently deleted: Memento plan node 0ef7416f (sub-idea 9db9cdc2) / scenario set 7025df84
# User request 2026-10-12: "let's tackle 1-3 right now" (1 = a way to empty Recently deleted).
# Chosen: an Empty button plus a per-item Delete, both confirmed. Resolves S8 follow-up 809192f8.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Wednesday 2026-10-14 in America/Chicago.

Feature: Permanently delete from Recently deleted
  As a habit tracker user,
  I need to remove deleted items for good, one at a time or all at once
  so that Recently deleted doesn't grow forever.

  Background:
    Given "Meditate" (daily habit, 40 check-ins), "Peloton ride" (weekly goal, 3 per week, 12 logs) and "Call mom" (to-do) are in Recently deleted

  # --- Delete one ---

  @happy-path
  Scenario: Delete one item for good after confirming
    When I tap "Delete Meditate" and then "Delete" in the confirmation
    Then "Meditate" is no longer listed
    And the message "Deleted “Meditate” for good." is displayed
    And storage holds no item, check-ins or targets for "Meditate"

  @happy-path
  Scenario: The confirmation explains it can't be undone
    When I tap "Delete Meditate"
    Then a confirmation reads "Delete “Meditate” for good? Its history goes too. This can't be undone."
    And it has the buttons "Cancel" and "Delete"

  @edge-case
  Scenario: Cancelling keeps the item
    When I tap "Delete Meditate" and then "Cancel"
    Then "Meditate" is still listed with its "Restore" button
    And storage still holds its 40 check-ins

  @edge-case
  Scenario: Deleting one leaves the others alone
    When I delete "Peloton ride" for good
    Then "Meditate" and "Call mom" are still listed
    And "Meditate" still has 40 check-ins in storage

  # --- Empty ---

  @happy-path
  Scenario: Empty removes everything after confirming
    When I tap "Empty" and then "Delete all" in the confirmation
    Then the page reads "Nothing deleted."
    And the message "Emptied Recently deleted." is displayed
    And storage holds no deleted items, and no check-ins or targets for them

  @happy-path
  Scenario: The Empty confirmation counts the items
    When I tap "Empty"
    Then a confirmation reads "Delete all 3 items for good? Their history goes too. This can't be undone."
    And it has the buttons "Cancel" and "Delete all"

  @edge-case
  Scenario: Empty is hidden when nothing is deleted
    Given Recently deleted is empty
    Then no "Empty" button is displayed

  @edge-case
  Scenario: The Empty confirmation says "1 item" for one
    Given only "Call mom" is in Recently deleted
    When I tap "Empty"
    Then the confirmation reads "Delete all 1 item for good? Their history goes too. This can't be undone."

  @integration
  Scenario: Habits that aren't deleted are never touched
    Given the active habit "Stretch" has 10 check-ins
    When I empty Recently deleted
    Then "Stretch" is still on Today with 10 check-ins in storage

  # --- Errors ---

  @error
  Scenario: A failed permanent delete changes nothing
    Given IndexedDB rejects the next write
    When I delete "Meditate" for good
    Then the message "Couldn't save. Your phone may be out of storage." is displayed
    And "Meditate" is still listed with its 40 check-ins in storage

  @error
  Scenario: Only deleted items can be removed for good
    Given "Stretch" is an active habit
    When the repository is asked to delete "Stretch" for good
    Then it returns the error "Habit not found" and "Stretch" keeps its check-ins

  # --- Security / integrity ---

  @security
  Scenario: Item names stay plain text in the confirmation
    Given a deleted habit is named "<img src=x onerror=alert(1)>"
    When I tap its Delete button
    Then the confirmation shows the name as text and no image element is created

  @security
  Scenario: Delete and Empty send nothing anywhere
    When I empty Recently deleted
    Then no network request is made

  # --- Performance ---

  @performance
  Scenario: Emptying 500 deleted items stays quick
    Given 500 deleted items with 20,000 check-ins between them
    When I empty Recently deleted
    Then the page reads "Nothing deleted." with the time recorded as a test annotation and a pathological ceiling of 5 seconds

  @integration
  Scenario: A backup made after emptying holds none of the removed items
    When I empty Recently deleted and then export a backup
    Then the backup contains no item, check-in or target for the 3 removed items

  @custom-accessibility
  Scenario: Buttons are labelled and large enough
    Then each row has "Restore <name>" and "Delete <name>" buttons and "Empty", all at least 44 by 44 pixels, and the confirmation is an alert dialog

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then deleteForever and emptyDeleted return Result<T> and never throw for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the permanent delete lives in src/data/items-repo.ts in one transaction, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
