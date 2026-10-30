# Assistant arrivals notice: Memento plan node c6781957 (sub-idea 188a13c7) / scenario set 7aa9cee7
# User request 2026-10-30: "do the notice". Resolves follow-up 071a83fe of slice 857320bd ("No in-app
# notice when assistant to-dos arrive"). Chosen: a card on Today that names them and stays until OK,
# with new arrivals added to it.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Friday 2026-10-30 in America/Chicago.

Feature: Notice for new to-dos from my assistant
  As a habit tracker owner,
  I need Today to tell me which to-dos my assistant just added
  so that I know they arrived without hunting through my lists.

  Background:
    Given the app is paired with my assistant

  # --- The card ---

  @happy-path
  Scenario: Two arrivals are named on Today
    Given my assistant delivers "Pay the plumber" and "Book dentist"
    When I open Today
    Then a card labelled "New from your assistant" reads "2 new to-dos from your assistant: Pay the plumber and Book dentist"
    And it has an "OK" button

  @happy-path
  Scenario: One arrival
    Given my assistant delivers "Pay Xcel bill"
    When I open Today
    Then the card reads "1 new to-do from your assistant: Pay Xcel bill"

  @happy-path
  Scenario: OK hides the card for good
    Given the card shows "Pay the plumber"
    When I tap "OK"
    Then the card is no longer displayed
    And after closing and reopening the app the card is still not displayed

  @happy-path
  Scenario: The card stays until OK, even after closing the app
    Given the card shows "Pay the plumber"
    When I close and reopen the app without tapping OK
    Then the card still reads "1 new to-do from your assistant: Pay the plumber"

  @happy-path
  Scenario: Later arrivals add to the same card
    Given the card shows "Pay the plumber"
    When my assistant delivers "Book dentist" on the next sync
    Then the card reads "2 new to-dos from your assistant: Pay the plumber and Book dentist"

  @edge-case
  Scenario: Three names are listed in full
    Given my assistant delivers "A", "B" and "C"
    Then the card reads "3 new to-dos from your assistant: A, B and C"

  @edge-case
  Scenario: More than three are summarised
    Given my assistant delivers "A", "B", "C", "D" and "E"
    Then the card reads "5 new to-dos from your assistant: A, B, C and 2 more"

  @edge-case
  Scenario: A to-do deleted before OK drops out of the card
    Given the card shows "Pay the plumber" and "Book dentist"
    When I delete "Book dentist"
    And I open Today again
    Then the card reads "1 new to-do from your assistant: Pay the plumber"

  @edge-case
  Scenario: The card goes away when all its to-dos were deleted
    Given the card shows only "Pay the plumber"
    When I delete "Pay the plumber" and open Today again
    Then no card labelled "New from your assistant" is displayed

  @edge-case
  Scenario: A renamed arrival shows its new name
    Given the card shows "Pay the plumber"
    When I rename it to "Pay plumber invoice" and open Today again
    Then the card reads "1 new to-do from your assistant: Pay plumber invoice"

  @edge-case
  Scenario: A to-do received again is not counted twice
    Given "Pay the plumber" was received and is on the card
    When the assistant sends the same to-do id again
    Then the card still reads "1 new to-do from your assistant: Pay the plumber"

  @edge-case
  Scenario: The card sits below the install card and above the backup reminder
    Given the install card, the assistant card and the backup reminder are all due
    When I open Today
    Then they appear in that order

  @edge-case
  Scenario: The card shows only on Today
    When I open the Lists tab, History and a list page
    Then none of them shows the card labelled "New from your assistant"

  # --- Who sees it ---

  @security
  Scenario: Family installs never see the card
    Given the app has never been paired
    When I open Today
    Then no card labelled "New from your assistant" is displayed and no request is made

  @security
  Scenario: Remove clears the card
    Given the card shows "Pay the plumber"
    When I open the Assistant sheet and tap "Remove"
    Then the card is no longer displayed on Today

  @security
  Scenario: Names stay plain text
    Given my assistant delivers a to-do named "<img src=x onerror=alert(1)>"
    When I open Today
    Then the card shows the name as text and no image element is created

  @integration
  Scenario: The card is never part of a backup
    Given the card shows "Pay the plumber"
    When I export a backup and restore it on a fresh install
    Then "Pay the plumber" is restored and no card labelled "New from your assistant" is displayed

  # --- Errors ---

  @error
  Scenario: Arrivals and the card are saved together
    Given saving the received to-dos fails
    When the app syncs
    Then no to-do is added, nothing is acknowledged and no card is displayed

  @error
  Scenario: OK that can't be saved still hides the card for now
    Given the card shows "Pay the plumber" and the next write fails
    When I tap "OK"
    Then the card is no longer displayed for the rest of this visit

  # --- Performance ---

  @performance
  Scenario: A large delivery shows at once
    Given my assistant delivers 50 to-dos in one sync
    When I open Today
    Then the card reads "50 new to-dos from your assistant: " followed by the first three names "and 47 more", with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  @custom-accessibility
  Scenario: The card is labelled and its button is large enough
    Then the card is a region labelled "New from your assistant" and "OK" is at least 44 by 44 pixels

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then reading and clearing the arrivals return Result<T> and never throw for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the card wording lives in src/domain/assistant.ts, the arrivals list in the assistant repository, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
