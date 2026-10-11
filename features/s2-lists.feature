# S2 lists: Memento plan node 1419c951 / sub-idea bfeabe9a / scenario set 6ae2060b
# Refines the @S2 scenarios in habit-tracker.feature. Decisions from the user: four starter lists,
# emoji icons, bottom tab bar (Today | Lists). Reordering uses Move up / Move down buttons
# (more accessible than touch dragging on iOS); drag-to-reorder stays a later nice-to-have.

Feature: Lists
  As a habit tracker user,
  I need colorful emoji lists like Fitness and Work
  so that my commitments are grouped by life area and I can find them at a glance.

  Background:
    Given the app is open on a fresh install in the iPhone Home Screen

  # --- Happy path ---

  @happy-path
  Scenario: A bottom tab bar switches between Today and Lists
    When I tap "Lists" in the tab bar
    Then the URL hash is "#/lists"
    And the "Lists" heading is displayed
    And the "Lists" tab has aria-current "page"
    When I tap "Today" in the tab bar
    Then the "Today" heading is displayed

  @happy-path
  Scenario: First open shows four starter lists
    When I open the Lists tab
    Then I see 4 lists in this order: "Fitness", "Work", "Side Business", "Personal"
    And "Fitness" shows the emoji "🏋️" on an orange circle
    And "Work" shows "💼" on blue, "Side Business" shows "🚀" on purple, and "Personal" shows "🏠" on green

  @happy-path
  Scenario: Create a list with a name, emoji and color
    When I tap "New list", enter the name "Reading", the emoji "📚", pick the color "teal" and tap "Save"
    Then the Lists tab shows 5 lists
    And "Reading" is last, with "📚" on a teal circle

  @happy-path
  Scenario: Rename and recolor a list
    Given I am in Edit mode
    When I choose "Edit Work", change the name to "Day Job" and the color to "red" and tap "Save"
    Then the first-run order is unchanged
    And the second row reads "Day Job" on a red circle

  @happy-path
  Scenario: Move a list up and down
    Given I am in Edit mode
    When I tap "Move Side Business up"
    Then the lists are ordered "Fitness", "Side Business", "Work", "Personal"
    And after closing and reopening the app the order is still "Fitness", "Side Business", "Work", "Personal"

  @happy-path
  Scenario: Delete an empty list after confirmation
    Given I am in Edit mode and "Personal" has 0 items
    When I tap "Delete Personal"
    Then a confirmation reads "Delete "Personal"?"
    And the list remains until I tap "Delete"
    And after I tap "Delete" the Lists tab shows 3 lists

  @happy-path
  Scenario: Deleting a list with items archives them
    Given "Work" has 4 items
    And I am in Edit mode
    When I tap "Delete Work"
    Then a confirmation reads "Delete "Work" and its 4 items? Their history will be archived."
    And after I tap "Delete" the 4 items have an archivedAt timestamp and are not deleted from storage

  # --- Input validation ---

  @error
  Scenario Outline: Invalid list input is rejected with a specific message
    When I try to save a list named "<name>" with emoji "<emoji>" and color "<color>"
    Then no list is saved
    And the message "<message>" is displayed

    Examples:
      | name                                      | emoji | color  | message                                  |
      |                                           | 📚    | teal   | List name can't be empty                 |
      | ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNO1 | 📚    | teal   | List name must be 40 characters or fewer |
      | Reading                                   | ab    | teal   | Pick exactly one emoji                   |
      | Reading                                   | 7     | teal   | Pick exactly one emoji                   |
      | Reading                                   | 📚📖  | teal   | Pick exactly one emoji                   |
      | Reading                                   | 📚    | mauve  | Pick one of the listed colors            |

  # --- Edge cases ---

  @edge-case
  Scenario: Leading and trailing spaces in a name are trimmed
    When I create a list named "   Reading   " with emoji "📚" and color "teal"
    Then the saved list name is "Reading"

  @edge-case
  Scenario Outline: Compound emoji count as one emoji
    When I create a list with the emoji "<emoji>"
    Then the list is saved

    Examples:
      | emoji | description                       |
      | 🏋️    | emoji plus variation selector     |
      | 👍🏽    | emoji with skin-tone modifier     |
      | 👨‍👩‍👧   | zero-width-joiner family sequence |

  @edge-case
  Scenario: Deleted starter lists never come back
    Given I deleted all 4 starter lists
    When I close and reopen the app
    Then the Lists tab shows 0 lists
    And the message "No lists yet. Tap + to create one." is displayed

  @edge-case
  Scenario: Starter lists are seeded exactly once even if two launches race
    When two app instances open at the same time on a fresh install
    Then exactly 4 lists exist in storage

  @edge-case
  Scenario: Moving the first list up or the last list down changes nothing
    Given I am in Edit mode
    When I tap "Move Fitness up"
    Then the order is unchanged and the "Move Fitness up" button is disabled

  @edge-case
  Scenario: Unknown routes fall back to Today
    When I open "#/nonsense"
    Then the "Today" heading is displayed

  @edge-case
  Scenario: Cancelling the delete confirmation keeps the list
    Given I am in Edit mode
    When I tap "Delete Fitness" and then "Cancel"
    Then the Lists tab still shows 4 lists

  # --- Error handling ---

  @error
  Scenario: A storage failure is reported and nothing is lost
    Given IndexedDB rejects the next write with a "Connection to Indexed Database server lost" error
    When I create a list named "Reading" with emoji "📚" and color "teal"
    Then the message "Couldn't save. Your phone may be out of storage." is displayed
    And the repository returns a failed Result instead of throwing
    And the list shown on screen matches what is in storage

  # --- Integration ---

  @integration
  Scenario: Lists persist across a reload in IndexedDB
    Given I created the list "Reading"
    When I reload the page
    Then "Reading" is still listed after the 4 starter lists

  @integration
  Scenario: Schema v1 declares every table the later slices need
    When the database opens
    Then it has the tables "lists", "items", "completions", "targetHistory" and "meta"
    And "completions" has a compound index on "[itemId+dayKey]"

  # --- Security ---

  @security
  Scenario: List names containing HTML are shown as plain text
    When I create a list named "<img src=x onerror=alert(1)>" with emoji "📚" and color "teal"
    Then the row text is literally "<img src=x onerror=alert(1)>"
    And 0 img elements are added to the document

  # --- Performance ---

  @performance
  Scenario: A hundred lists render and reorder quickly
    Given 100 lists exist
    When I open the Lists tab and tap "Move List 50 up"
    Then the Lists tab renders within 300 ms
    And storage holds exactly 100 lists with distinct order values 0 to 99

  # --- Accessibility ---

  @accessibility
  Scenario: Controls are labelled and large enough
    When I open the Lists tab in Edit mode
    Then every row exposes the buttons "Edit Fitness", "Move Fitness up", "Move Fitness down" and "Delete Fitness"
    And every button and tab is at least 44 by 44 CSS pixels
    And the tab bar bottom padding includes env(safe-area-inset-bottom)

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code and 95% coverage gates the build
    Given features/s2-lists.feature was committed before any S2 code
    Then Vitest with at least 95% line and branch coverage and the build exit 0 (Build verification)

  @regression
  Scenario: No mocks in production code; ServiceResult-style results; cancellation
    Then no production file under "src/" contains test doubles
    And every repository method returns Result<T> (the ServiceResult<T> pattern)
    And repositories use async/await and never throw for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture boundaries
    Then "src/domain" imports nothing from "src/data" or "src/ui", and "src/data" imports nothing from "src/ui"
    And no module exceeds 300 lines

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
