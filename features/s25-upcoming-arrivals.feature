# Assistant to-dos arriving on Upcoming: Memento plan node 99f03199 / scenario set 17421bc5
# Owner 2026-11-10: "start the upcoming test". Upcoming relies on the Router's revision remount
# (bumped by App.svelte when a sync adds to-dos), the same path Today uses; nothing asserted it.
# Test-only: no product change expected. Architecture note: client-only PWA by user decision
# 0e39a594 (SSR preference waived for this project).
# Today is Wednesday 2026-10-14 in the unit tests; e2e tests use the real clock.

Feature: Assistant to-dos arrive on the Upcoming tab
  As the app's owner,
  I need to-dos my assistant delivers while I'm on the Upcoming tab to appear there
  so that I never miss a delivery because I was on the wrong tab.

  Background:
    Given the app is paired with the assistant and the Upcoming tab is open

  # --- Arrivals ---

  @happy-path
  Scenario: A delivery while Upcoming is open shows without leaving the tab
    When the app returns to the foreground and the assistant delivers "Call the bank" due tomorrow for "Work"
    Then "Call the bank" appears under "Tomorrow" with "💼 Work", and the address still ends in "#/upcoming"

  @happy-path
  Scenario: The assistant's note shows on Upcoming
    When the assistant delivers "Plan offsite" due next Monday with the note "next week"
    Then "Plan offsite" shows "next week" under its title in its date section

  @happy-path
  Scenario: A to-do with no due date lands under No date
    When the assistant delivers "Read the contract" with no due date
    Then "Read the contract" appears under "No date"

  @edge-case
  Scenario: An overdue delivery goes under Overdue
    When the assistant delivers "Renew licence" due 2 days ago
    Then "Renew licence" appears under "Overdue" in red

  @edge-case
  Scenario: A delivery with nothing new leaves Upcoming as it was
    Given every to-do the assistant offers is already saved
    When the app returns to the foreground
    Then Upcoming shows the same rows in the same order

  @edge-case
  Scenario: An unknown list name still arrives, in the Assistant list
    When the assistant delivers "Mystery task" for the list "Nowhere"
    Then "Mystery task" appears on Upcoming with "📥 Assistant"

  @edge-case
  Scenario: A row being ticked when a delivery arrives stays ticked
    Given I just ticked "Old task" on Upcoming and it is still lingering
    When a delivery arrives
    Then "Old task" is stored as done

  # --- Errors and safety ---

  @error
  Scenario: A failed delivery leaves Upcoming unchanged and shows no error
    Given the assistant answers with a server error
    When the app returns to the foreground
    Then Upcoming shows the same rows and no error message

  @security
  Scenario: A delivered title stays plain text on Upcoming
    When the assistant delivers a to-do titled "<img src=x onerror=alert(1)>"
    Then the title shows as text and no image element is created

  @security
  Scenario: An unpaired app on Upcoming never contacts the assistant
    Given the app is not paired
    When the app returns to the foreground on Upcoming
    Then no request goes to https://app.80dventures.com

  # --- Integration and performance ---

  @integration
  Scenario: Delivered to-dos are acknowledged after they are saved
    When "Call the bank" arrives on Upcoming
    Then the assistant receives an acknowledgement with its id

  @performance
  Scenario: 50 to-dos delivered on Upcoming appear without a visible wait
    When the assistant delivers 50 to-dos while Upcoming is open
    Then all 50 appear with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the tests that implement it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the tests drive the real repositories and the real sync, replacing only the network with Playwright routes

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then no production file changes unless a test exposes a defect, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
