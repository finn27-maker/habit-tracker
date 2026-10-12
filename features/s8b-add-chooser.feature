# S8 follow-up: Memento plan node 00854c6f / scenario set cecd029b
# User request 2026-10-12: a one-time task was saved as a daily habit because Repeats defaulted
# to "Every day" ("it was a daily habit, make adding ask habit or to-do first").
# Supersedes s5c "A new to-do starts due Today" step "When I tap New habit and set Repeats" and every
# earlier step that picks a type through the "Repeats" selector: the selector is removed.
# Today is Wednesday 2026-10-14 in America/Chicago.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Adding asks what kind of item first
  As a habit tracker user,
  I need to choose habit, weekly goal or to-do before filling anything in
  so that a one-time task is never saved as a daily habit by accident.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Wednesday "2026-10-14"

  @happy-path
  Scenario: The + button asks what I am adding
    When I tap the button "Add" on Today
    Then a dialog named "What are you adding?" offers the buttons "Daily habit", "Weekly goal" and "To-do"
    And each shows a one-line description: "Every day, with a streak", "A number of times each week", "Once, with an optional due date"
    And no "Name" field and no "Repeats" selector are shown

  @happy-path
  Scenario: Choosing To-do shows the to-do form
    When I tap "Add" and then "To-do"
    Then the dialog is named "New to-do" with "Name", "List" and "Due" (showing "Today")
    And there is no "Times per week" selector and no "Repeats" selector

  @happy-path
  Scenario: Choosing Daily habit shows the habit form
    When I tap "Add" and then "Daily habit"
    Then the dialog is named "New daily habit" with "Name" and "List" only

  @happy-path
  Scenario: Choosing Weekly goal shows the goal form
    When I tap "Add" and then "Weekly goal"
    Then the dialog is named "New weekly goal" with "Name", "List" and "Times per week" (showing "3")

  @happy-path
  Scenario: A to-do added this way is a to-do
    When I add "Pick up dry cleaning" as a "To-do"
    Then storage holds it with type "todo" and dueDate "2026-10-14"
    And tapping its name on Today opens "Edit to-do", not a history page

  @edge-case
  Scenario: Back returns to the choice without saving
    Given I chose "Weekly goal" and typed "Peloton ride"
    When I tap "Back"
    Then the "What are you adding?" choices are shown again and nothing is stored

  @edge-case
  Scenario: Cancel from the choice closes without saving
    When I tap "Add" and then "Cancel"
    Then no dialog is shown and nothing is stored

  @edge-case
  Scenario: Adding from a list page keeps that list
    When I open the "Work" list page, tap "Add" and choose "To-do"
    Then the "List" selector shows "💼 Work"

  @edge-case
  Scenario: Editing is unchanged
    When I tap "Edit" on a habit's page
    Then the dialog "Edit habit" opens straight away with no "What are you adding?" step

  @error
  Scenario: A blank name is still refused after choosing
    When I choose "To-do" and save with a blank name
    Then the alert "Name can't be empty" is shown and the dialog stays open

  @security
  Scenario: A name with HTML stays plain text whichever type is chosen
    When I add "<img src=x onerror=alert(1)>" as a "To-do"
    Then it is shown literally on Today and 0 img elements exist

  @performance
  Scenario: The choice appears at once
    When I tap "Add"
    Then the choices are visible within 300 ms

  @integration
  Scenario: Each choice saves the matching type
    When I add "A" as "Daily habit", "B" as "Weekly goal" and "C" as "To-do"
    Then storage holds types "daily", "weekly" and "todo" respectively, and B has a weekly target of 3

  @accessibility
  Scenario: The choices are labelled, large enough and pass automated checks
    Then each choice button is at least 44 CSS pixels tall and named by its title
    And axe-core reports 0 WCAG 2.1 A/AA violations on the choice dialog in light and dark

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then saving still goes through ItemsRepo.create returning Result<Item>

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the item types and their labels come from src/domain/items.ts and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When the Repeats selector is no longer used by any screen
    Then its code and tests are removed in the same change rather than left as dead code
