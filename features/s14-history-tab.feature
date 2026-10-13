# History tab: Memento plan node 4ad7e7fa (sub-idea 9db9cdc2) / scenario set 1d0a9330
# User request 2026-10-12: "let's tackle 1-3 right now" (2 = an overview across all habits). Chosen:
# a new History tab beside Today and Lists. Resolves S6 follow-up 9b832a9c.
# Reuses the S6 item-page numbers (src/domain/history.ts), so the tab and each item page agree.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Wednesday 2026-10-14 in America/Chicago.

Feature: History tab
  As a habit tracker user,
  I need one place that shows how all my habits and goals are going
  so that I can see my progress at a glance without opening each one.

  # --- Tab ---

  @happy-path
  Scenario: The tab bar has Today, History and Lists
    When I open the app
    Then the tab bar shows "Today", "History" and "Lists" in that order
    And tapping "History" opens "#/history" with the heading "History"

  @happy-path
  Scenario: The combined heatmap counts every habit and goal
    Given the daily habit "Stretch" was done on 2026-10-12 and 2026-10-13
    And the weekly goal "Run" was logged twice on 2026-10-13
    When I open the History tab
    Then the heatmap is labelled "Last 6 months: 4 check-ins across 2 habits and goals"
    And 2026-10-13 is shaded darker than 2026-10-12

  @happy-path
  Scenario: Each habit and goal shows its streak, best and recent rate
    Given the daily habit "Stretch" has a current streak of 3 days and a best of 12
    And the weekly goal "Run" has a current streak of 2 weeks and a best of 5
    When I open the History tab
    Then "Stretch" reads "3 days now · Best 12 days · Last 30 days 40%"
    And "Run" reads "2 weeks now · Best 5 weeks · Last 12 weeks 75%"

  @happy-path
  Scenario: Habits and goals are listed in list order, then their order in each list
    Given "Health" (first list) has "Walk" then "Gym" and "Work" (second list) has "Inbox zero"
    When I open the History tab
    Then the rows read "Walk", "Gym", "Inbox zero" with each list's emoji and name beside them

  @happy-path
  Scenario: Tapping a row opens its page, and Back returns to History
    When I tap "Stretch" on the History tab
    Then its page "#/item/<id>" opens with the History tab highlighted
    And tapping "Back" returns to the History tab

  # --- What is included ---

  @edge-case
  Scenario: To-dos are not on the History tab
    Given the to-do "Call mom" was checked off yesterday
    When I open the History tab
    Then no row reads "Call mom" and the heatmap does not count it

  @edge-case
  Scenario: Deleted habits are not on the History tab
    Given the daily habit "Old habit" with 10 check-ins is in Recently deleted
    When I open the History tab
    Then no row reads "Old habit" and the heatmap does not count its check-ins

  @edge-case
  Scenario: The empty History tab says what to do
    Given there are no habits or weekly goals
    When I open the History tab
    Then it reads "No habits or weekly goals yet. Add one with + on Today."
    And no heatmap is displayed

  @edge-case
  Scenario: A habit with no check-ins shows zeros, not blanks
    Given the daily habit "New thing" has no check-ins
    When I open the History tab
    Then "New thing" reads "0 days now · Best 0 days · Last 30 days —"

  @edge-case
  Scenario: The tab updates after a check-in elsewhere
    Given the History tab shows "Stretch" with 3 days now
    When I check "Stretch" off on Today and open History again
    Then "Stretch" reads "4 days now"

  @edge-case
  Scenario: Crossing midnight with History open moves the heatmap to the new day
    Given the History tab is open at 23:59 on 2026-10-14
    When the clock passes midnight
    Then the heatmap's last day is 2026-10-15

  # --- Errors ---

  @error
  Scenario: A failed load is reported
    Given IndexedDB fails to read the items
    When I open the History tab
    Then the message "Couldn't load your habits. Close and reopen the app." is displayed

  # --- Security ---

  @security
  Scenario: Names stay plain text
    Given the habit named "<script>alert(1)</script>"
    When I open the History tab
    Then the row shows the name as text and no script element is created

  # --- Performance ---

  @performance
  Scenario: Three years of history across 30 habits opens without a visible wait
    Given 30 habits and goals with 20,000 check-ins between them
    When I open the History tab
    Then every row is visible with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  # --- Integration ---

  @integration
  Scenario: Numbers match each item's own page
    Given the weekly goal "Run" has history
    When I compare its History row with its page
    Then the current streak, best streak and recent rate are the same on both

  @custom-accessibility
  Scenario: The tab and rows are accessible
    Then the History tab link marks itself as the current page when open, each row is a link at least 44 pixels tall named after the habit, and the heatmap is one labelled image

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the History tab reads storage through repositories that return Result<T>

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the overview rows are built by a pure function in src/domain that reuses historyStats, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
