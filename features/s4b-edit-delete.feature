# Edit and delete: Memento plan node e5ac550b / sub-idea e683da70 / scenario set cf9f632c
# Pulled forward from S8 at the user's request (a duplicate daily "Peloton" could not be removed).
# User choices: on daily habits the circle checks off and the name opens the edit sheet;
# Delete archives the item (its history is kept for a future History/Archived screen).

Feature: Edit and delete habits and goals
  As a habit tracker user,
  I need to edit and delete any habit or goal
  so that mistakes and duplicates do not clutter my Today screen.

  Background:
    Given the app is open on the Today tab in the iPhone Home Screen
    And today is "2026-10-14"

  # --- Daily habit row ---

  @happy-path
  Scenario: The circle checks a daily habit off without opening anything
    Given the daily habit "Meditate" exists
    When I tap the checkbox named "Meditate"
    Then the checkbox has aria-checked "true"
    And no dialog is shown

  @happy-path
  Scenario: Tapping a daily habit's name opens its edit sheet
    Given the daily habit "Meditate" in "Personal" exists
    When I tap the button named "Edit Meditate"
    Then a dialog named "Edit habit" is shown with "Name" set to "Meditate" and "List" set to "Personal"
    And the dialog has no "Repeats" or "Times per week" field
    And the checkbox for "Meditate" still has aria-checked "false"

  # --- Editing ---

  @happy-path
  Scenario: Rename and move a daily habit, keeping its streak
    Given the daily habit "Meditate" in "Personal" was done on "2026-10-13" and "2026-10-14"
    When I rename it "Meditate 10 min", move it to "Fitness" and tap "Save"
    Then "Meditate 10 min" appears under "Fitness" with a streak badge "🔥 2"
    And "Personal" no longer shows it

  @happy-path
  Scenario: Weekly goals keep editing name, list and target
    Given the weekly goal "Peloton ride" with target 3 exists
    When I tap the button named "Edit Peloton ride"
    Then a dialog named "Edit weekly goal" is shown with "Times per week" set to 3

  @error
  Scenario: A blank name is refused in the edit sheet
    When I open the edit sheet for "Meditate", clear the name and tap "Save"
    Then the alert "Name can't be empty" is shown and the dialog stays open

  @edge-case
  Scenario: Cancelling the edit changes nothing
    When I open the edit sheet for "Meditate", change the name to "X" and tap "Cancel"
    Then "Meditate" is still listed and no dialog is shown

  # --- Deleting ---

  @happy-path
  Scenario: Delete asks for confirmation inside the sheet
    When I open the edit sheet for "Meditate" and tap "Delete"
    Then the sheet reads "Delete "Meditate"? Its history is kept, but it leaves Today."
    And it offers "Cancel" and "Delete"

  @happy-path
  Scenario: Confirming removes a duplicate daily habit and leaves the weekly goal
    Given a daily habit "Peloton ride" and a weekly goal "Peloton ride" both exist in "Fitness"
    When I open the edit sheet for the daily "Peloton ride", tap "Delete" and then "Delete" again
    Then no checkbox named "Peloton ride" is shown
    And the weekly ring for "Peloton ride" is still shown

  @happy-path
  Scenario: Deleting a weekly goal removes its ring
    When I open the edit sheet for the weekly goal "Peloton ride", tap "Delete" and confirm
    Then no button named starting "Log Peloton ride" is shown

  @edge-case
  Scenario: Cancelling the confirmation keeps the item and returns to editing
    When I open the edit sheet for "Meditate", tap "Delete" and then "Cancel"
    Then the "Edit habit" sheet is shown again with the "Name" field
    And "Meditate" is still stored without an archivedAt timestamp

  @edge-case
  Scenario: The last item in a list takes its header with it
    Given "Meditate" is the only item in "Personal"
    When I delete "Meditate"
    Then no "Personal" header is shown on Today

  @edge-case
  Scenario: Deleting the only item shows the empty state
    Given "Meditate" is the only item
    When I delete "Meditate"
    Then the message "Nothing here yet. Tap + to add your first habit or to-do." is shown

  # --- History is kept ---

  @integration
  Scenario: Deleting archives the item and keeps its history
    Given the weekly goal "Peloton ride" has 2 completions and a target record
    When I delete it
    Then it has an archivedAt timestamp in storage
    And its 2 completions and 1 target record remain in storage

  @integration
  Scenario: A deleted item stays gone after a reload
    When I delete "Meditate" and reload the page
    Then no checkbox named "Meditate" is shown

  @edge-case
  Scenario: Archived items refuse further changes from a stale screen
    Given "Meditate" was archived
    Then toggling, logging, removing a log or editing it each returns "Habit not found"
    And archiving it again returns "Habit not found" and changes nothing

  # --- Failures ---

  @error
  Scenario: A failed delete keeps the item and says so
    Given IndexedDB rejects the next write
    When I confirm deleting "Meditate"
    Then the alert "Couldn't save. Your phone may be out of storage." is shown
    And "Meditate" is still listed

  # --- Security ---

  @security
  Scenario: An item name with HTML is plain text in the edit sheet and confirmation
    Given the daily habit "<img src=x onerror=alert(1)>" exists
    When I open its edit sheet and tap "Delete"
    Then the confirmation shows the literal text and 0 img elements exist

  # --- Performance ---

  @performance
  Scenario: Deleting is quick
    When I confirm a delete
    Then the item leaves Today within 300 ms

  # --- Accessibility ---

  @accessibility
  Scenario: The circle and the name are separate, labelled, 44 px targets
    Then the checkbox named "Meditate" and the button named "Edit Meditate" are each at least 44 by 44 CSS pixels
    And the confirmation's Delete button is styled as destructive and Cancel is listed first

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the slice's code
    Then Vitest meets the tiered coverage thresholds, the build exits 0 and the CI sequence passes locally before pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the new archive method returns Result<T> and never throws for expected failures
    And no production file contains test doubles

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then src/domain imports nothing from src/data, src/platform or src/ui and no module exceeds 300 lines

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
