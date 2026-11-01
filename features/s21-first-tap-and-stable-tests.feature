# First tap before lists load, and two flaky e2e tests: Memento plan node 3e13c6c8 / scenario set 192f0e14
# User request 2026-11-01: "let's fix the flaky tests".
# Root causes: (1) a real app bug: the add sheet picks its list when it opens, so a tap on +
# before the first-run starter lists have loaded leaves the item with no list and Save fails;
# the backup e2e test tapped + straight after the first load. (2) A test race: the assistant
# 50-to-do test paired the app while its first page was still open, so a late focus event on
# that page could take the delivery and the reloaded page had nothing new to announce.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: The first tap on + always works, and the e2e suite is not flaky
  As a habit tracker user,
  I need the add sheet to save even when I tap + the moment the app first opens
  so that my first habit or to-do is never lost to an error I didn't cause.

  # --- First tap ---

  @happy-path
  Scenario: Tapping + before the starter lists exist still saves into the first list
    Given a fresh install that is still creating its starter lists
    When I tap "+" straight away, type "Get stamps" and tap "Save"
    Then the sheet closes and "Get stamps" is stored in the first list ("Health")

  @happy-path
  Scenario: The List field fills in as soon as the lists arrive
    Given I tapped "+" before the starter lists existed
    When the lists finish loading
    Then the "List" field shows the first list instead of being blank

  @edge-case
  Scenario: A list page still starts new items in its own list
    Given I am on the "Work" list page
    When I tap "+"
    Then the "List" field shows "Work"

  @edge-case
  Scenario: A list I already picked is not changed when lists reload
    Given the sheet is open with "Personal" chosen
    When the lists reload
    Then the "List" field still shows "Personal"

  @edge-case
  Scenario: With no lists at all the sheet still says to create one
    Given every list has been deleted
    When I tap "+"
    Then the sheet shows "Create a list in the Lists tab first, then come back to add a habit." and a "Close" button

  @error
  Scenario: A save that fails after a fast first tap is still reported
    Given IndexedDB rejects the next write
    When I tap "+" straight away, type "Get stamps" and tap "Save"
    Then the sheet stays open with "Couldn't save. Your phone may be out of storage."

  # --- Stable tests ---

  @regression
  Scenario: The backup reminder test no longer races the first load
    When the e2e test "a week after a backup, Today shows a one-tap Back up now card" adds "Meditate" right after the first load
    Then the sheet closes every time, in 30 repeated runs on both browsers

  @integration
  Scenario: The assistant delivery test cannot be taken by the page before the reload
    Given the fake assistant returns no to-dos until the first page has been closed
    When the paired app opens on a fresh page
    Then Today shows "50 new to-dos from your assistant: Task 0, Task 1, Task 2 and 47 more" every time, in 30 repeated runs on both browsers

  @performance
  Scenario: The assistant delivery is still announced without a visible wait
    When the paired app opens on a fresh page
    Then the notice appears with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  @security
  Scenario: An unpaired first page never contacts the assistant
    Given the app is opened before it has been paired
    Then no request goes to the assistant from that page

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then saving from the first-tap sheet goes through the repository's Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the default-list rule stays in src/ui/HabitForm.svelte and no import is added from src/ui into src/domain or src/data

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed

  @regression
  Scenario: Scrum story title
    Then the plan node reads as "Fix the first tap on + and two racy e2e tests so that CI only fails for real problems"
