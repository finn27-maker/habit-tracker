# Fairer History rates: Memento plan node 60d05b9d (sub-idea ab97672a) / scenario set d3ca966b
# User request 2026-10-30: "Start on fairer history rates". Resolves S6 follow-up 52420c56 ("Items have
# no creation date, so a habit's all-time rate starts at its first completion").
# Chosen: habits made from now on count from the day they were made; existing habits, which have no
# such date, keep counting from their first check-in.
# Weekly goals already count from the week of their first target (S4/S6), so only daily habits change.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Friday 2026-10-30 in America/Chicago.

Feature: Daily habit rates count from the day the habit was added
  As a habit tracker user,
  I need a new daily habit's rates to include the days I skipped after adding it
  so that History shows how I'm really doing, not just since my first check-in.

  # --- New habits ---

  @happy-path
  Scenario: A skipped day after adding a habit counts as missed
    Given I added the daily habit "Read" on 2026-10-27
    And I checked it off on 2026-10-29 only
    When I open History on 2026-10-30
    Then "Read" reads "1 day now · Best 1 day · Last 30 days 50%"

  @happy-path
  Scenario: The item page shows the same rates
    Given I added the daily habit "Read" on 2026-10-27 and checked it off on 2026-10-29 only
    When I open its page on 2026-10-30
    Then "Last 30 days" shows "50%" and "All time" shows "50%"

  @happy-path
  Scenario: The day a habit is added counts only once it's done
    Given I added the daily habit "Read" on 2026-10-29 and did not check it that day
    And I checked it off on 2026-10-30
    When I open History on 2026-10-30
    Then "Read" shows "Last 30 days 100%"

  @happy-path
  Scenario: The day a habit is added counts when done that day
    Given I added the daily habit "Walk" on 2026-10-28 and checked it off that day and on 2026-10-30
    When I open History on 2026-10-30
    Then "Walk" shows "Last 30 days 67%"

  @edge-case
  Scenario: A habit added today and not done yet has nothing to measure
    Given I added the daily habit "Stretch" today
    When I open History
    Then "Stretch" shows "Last 30 days —"

  @edge-case
  Scenario: A new habit never checked off shows 0%
    Given I added the daily habit "Floss" on 2026-10-27 and never checked it off
    When I open History on 2026-10-30
    Then "Floss" shows "Last 30 days 0%"

  @edge-case
  Scenario: The last 30 days start no earlier than the habit
    Given I added the daily habit "Read" 60 days ago and checked it off on the last 15 days
    When I open its page
    Then "Last 30 days" shows "50%" and "All time" shows about "25%"

  @edge-case
  Scenario: A check-in backfilled before the habit was added still counts from that day
    Given I added the daily habit "Read" on 2026-10-27
    And I backfilled a check-in on 2026-10-20 from its calendar
    When I open its page on 2026-10-30
    Then its rates count from 2026-10-20

  # --- Existing habits ---

  @happy-path
  Scenario: Habits added before this update keep their old rates
    Given the daily habit "Meditate" was added before this update and first checked off on 2026-10-20
    When I open History
    Then its rates still count from 2026-10-20, exactly as before

  # --- Type changes ---

  @edge-case
  Scenario: A to-do turned into a habit counts from the day it became one
    Given the to-do "Stretch" was added on 2026-10-01
    When I change it to a daily habit on 2026-10-28 and check it off on 2026-10-30
    Then on 2026-10-30 its "Last 30 days" counts 2026-10-29 and 2026-10-30, showing "50%"

  @edge-case
  Scenario: Switching between daily and weekly keeps the start day
    Given I added the daily habit "Gym" on 2026-10-20
    When I change it to a weekly goal and back to a daily habit
    Then its rates still count from 2026-10-20

  # --- Weekly goals ---

  @edge-case
  Scenario: Weekly goals are unchanged
    Given the weekly goal "Run" was created in the week of 2026-10-11
    When I open History
    Then its "Last 12 weeks" rate counts from the week of 2026-10-11, as before

  # --- Backups and errors ---

  @integration
  Scenario: The start day survives a backup and restore
    Given I added the daily habit "Read" on 2026-10-27
    When I export a backup and restore it on another phone
    Then "Read" still counts from 2026-10-27

  @integration
  Scenario: Older backups without start days still restore
    Given a backup file whose habits have no start day
    When I restore it
    Then every habit restores and counts from its first check-in

  @error
  Scenario: A backup with an invalid start day is refused as damaged
    Given a backup file where a habit's start day is "yesterday"
    When I try to restore it
    Then the message "This backup file is damaged and can't be restored." is displayed and nothing changes

  @security
  Scenario: Nothing new leaves the phone
    When I add a habit
    Then its start day is stored only on the phone and no network request is made for it

  # --- Performance ---

  @performance
  Scenario: History with 30 habits and three years of history opens without a visible wait
    Given 30 daily habits each with a start day and 20,000 check-ins between them
    When I open the History tab
    Then every row is visible with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then creating and updating items keeps returning Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the rate rule lives in src/domain/history.ts, the start day is set in src/data/items-repo.ts, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
