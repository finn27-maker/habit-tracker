# S8 follow-up: Memento plan node 00854c6f / scenario set 26c61182
# User request 2026-10-12: "I want the default when adding a new item to be a one time task due
# today ... to minimize the number of clicks."
# Supersedes s8b-add-chooser.feature (the separate "What are you adding?" screen): the type stays
# visible as a switch on the form itself, so a task still can't silently become a daily habit.
# Today is Monday 2026-10-12 in America/Chicago.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Adding defaults to a to-do due today
  As a habit tracker user,
  I need + to open a to-do due today with the type visible and changeable
  so that capturing a quick task takes as few taps as possible without hiding what I am creating.

  Background:
    Given the app is open in the iPhone Home Screen
    And today is Monday "2026-10-12"

  @happy-path
  Scenario: + opens a new to-do due today
    When I tap the button "Add" on Today
    Then a dialog named "New to-do" is shown
    And the "Type" radio group has "To-do" checked, then "Daily habit" and "Weekly goal"
    And "Due" shows "Today"
    And the "Name" field has focus

  @happy-path
  Scenario: A quick task takes a name and Save
    When I tap "Add", type "Pick up dry cleaning" and tap "Save"
    Then storage holds "Pick up dry cleaning" with type "todo" and dueDate "2026-10-12"
    And it is shown on Today with the label "Today"

  @happy-path
  Scenario: Switching the type to Daily habit changes the form
    Given the "New to-do" dialog is open
    When I choose "Daily habit" in "Type"
    Then the dialog is named "New daily habit", "Due" is gone and the hint reads "Every day, with a streak"

  @happy-path
  Scenario: Switching the type to Weekly goal asks how often
    Given the "New to-do" dialog is open
    When I choose "Weekly goal" in "Type"
    Then the dialog is named "New weekly goal" and "Times per week" shows "3"

  @edge-case
  Scenario: What I typed survives switching type
    Given I typed "Meditate" in the "New to-do" dialog
    When I choose "Daily habit" and save
    Then storage holds "Meditate" as a daily habit with no due date

  @edge-case
  Scenario: Switching back to To-do restores Due
    Given I chose "Weekly goal"
    When I choose "To-do" again
    Then "Due" is shown again with "Today"

  @edge-case
  Scenario: Adding from a list page keeps that list
    When I open the "Work" list page and tap "Add"
    Then the "List" selector shows "💼 Work" and "Type" is "To-do"

  @edge-case
  Scenario: Editing shows no type switch
    When I open "Edit to-do" for an existing to-do
    Then there is no "Type" radio group

  @error
  Scenario: A blank name is refused
    When I tap "Add" and "Save" without a name
    Then the alert "Name can't be empty" is shown and the dialog stays open

  @security
  Scenario: A name with HTML stays plain text
    When I add the to-do "<img src=x onerror=alert(1)>"
    Then it is shown literally on Today and 0 img elements exist

  @performance
  Scenario: The form appears at once
    When I tap "Add"
    Then the "New to-do" dialog is on screen within 300 ms of the tap, measured in the page

  @integration
  Scenario: Each type saves as itself
    When I add "A" as "To-do", "B" as "Daily habit" and "C" as "Weekly goal"
    Then storage holds types "todo", "daily" and "weekly", A due "2026-10-12" and C with a weekly target of 3

  @accessibility
  Scenario: The type switch is labelled, large enough and passes automated checks
    Then each "Type" option is a radio button at least 44 CSS pixels tall, named "To-do", "Daily habit" or "Weekly goal"
    And axe-core reports 0 WCAG 2.1 A/AA violations on the New to-do sheet in light and dark

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
    Then the type names, descriptions and their order come from src/domain/items.ts and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When the "What are you adding?" screen is no longer used
    Then its code, styles and tests are removed in the same change
