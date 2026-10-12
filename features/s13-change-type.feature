# Change an item's type: Memento plan node 1e9751d1 (sub-idea 9db9cdc2) / scenario set 9f9454a5
# User request 2026-10-12: "let's tackle 1-3 right now" (3 = change an item's type). Chosen: any type,
# with care. Daily <-> weekly keeps every check-in; switching to or from a to-do confirms first, and
# both kinds of history are kept so they come back if switched back. Resolves follow-up 676270ba.
# Revises s4b-edit-delete.feature, where the type could not change after creation.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Wednesday 2026-10-14 in America/Chicago; the week started Sunday 2026-10-11.

Feature: Change an item's type in Edit
  As a habit tracker user,
  I need to switch an item between daily habit, weekly goal and to-do
  so that an item made as the wrong type keeps its history instead of being deleted and re-made.

  # --- The switch ---

  @happy-path
  Scenario: Edit shows the Type switch with the current type selected
    Given the daily habit "Gym" in "Health"
    When I open Edit for "Gym"
    Then the Type switch shows "To-do", "Daily habit" and "Weekly goal" with "Daily habit" selected

  @happy-path
  Scenario: Daily habit to weekly goal keeps every check-in
    Given the daily habit "Gym" was done on 2026-10-01, 2026-10-02, 2026-10-05, 2026-10-12 and 2026-10-13
    When I open Edit for "Gym", choose "Weekly goal", pick 3 times per week and tap "Save"
    Then Today shows "Gym" as a weekly goal at 2 of 3 this week
    And its page shows 5 logs in the last 6 months

  @happy-path
  Scenario: Past weeks count against the new target
    Given the daily habit "Gym" was done 3 times in the week of 2026-10-04
    When I change "Gym" to a weekly goal with 3 times per week
    Then its page shows the week of 2026-10-04 as met

  @happy-path
  Scenario: Weekly goal to daily habit keeps every day it was logged
    Given the weekly goal "Run" was logged twice on 2026-10-12 and once on 2026-10-13
    When I change "Run" to a daily habit and tap "Save"
    Then Today shows "Run" as a daily habit with a 2-day streak
    And its calendar shows 2026-10-12 and 2026-10-13 as done

  @happy-path
  Scenario: Switching to a weekly goal shows the Times per week choice
    Given the daily habit "Gym"
    When I open Edit and choose "Weekly goal"
    Then a "Times per week" choice set to 3 is displayed

  @happy-path
  Scenario: A habit becomes a to-do after confirming
    Given the daily habit "Fix bike" with 4 check-ins
    When I open Edit, choose "To-do", tap "Save" and then "Change" in the confirmation
    Then "Fix bike" is an open to-do in its list, due as chosen in the sheet
    And storage still holds its 4 check-ins

  @happy-path
  Scenario: The confirmation for a habit becoming a to-do
    Given the daily habit "Fix bike"
    When I open Edit, choose "To-do" and tap "Save"
    Then a confirmation reads "Change “Fix bike” to a to-do? Its check-ins are kept and come back if you change it back."
    And it has the buttons "Cancel" and "Change"

  @happy-path
  Scenario: A to-do becomes a habit after confirming
    Given the to-do "Stretch" due 2026-10-15
    When I open Edit, choose "Daily habit", tap "Save" and then "Change"
    Then Today shows "Stretch" as a daily habit with no check-ins
    And storage still holds its due date 2026-10-15

  @happy-path
  Scenario: The confirmation for a to-do becoming a habit
    Given the to-do "Stretch"
    When I open Edit, choose "Weekly goal" and tap "Save"
    Then a confirmation reads "Change “Stretch” to a weekly goal? Its due date and checkmark are kept and come back if you change it back."

  @happy-path
  Scenario: Switching back brings the history back
    Given the daily habit "Fix bike" with 4 check-ins was changed to a to-do
    When I change "Fix bike" back to a daily habit
    Then its page shows 4 days done

  @happy-path
  Scenario: A completed to-do switched away and back is still completed
    Given the to-do "Call mom" was checked off
    When I change it to a daily habit and then back to a to-do
    Then "Call mom" is in its list's Completed section

  # --- No confirmation needed ---

  @edge-case
  Scenario: Daily and weekly switch without a confirmation
    Given the daily habit "Gym"
    When I choose "Weekly goal", pick 3 and tap "Save"
    Then no confirmation is displayed and the sheet closes

  @edge-case
  Scenario: Saving without changing the type never confirms
    Given the to-do "Pay rent"
    When I open Edit, change the name to "Pay rent and bills" and tap "Save"
    Then no confirmation is displayed and the name is "Pay rent and bills"

  @edge-case
  Scenario: Cancel in the confirmation returns to the sheet unchanged
    Given the daily habit "Fix bike"
    When I choose "To-do", tap "Save" and then "Cancel"
    Then the sheet is displayed with "To-do" still selected
    And "Fix bike" is still a daily habit in storage

  # --- Order and placement ---

  @edge-case
  Scenario: A to-do that becomes a habit joins the end of the list's habits
    Given "Health" has the habits "Walk" and "Water" and the to-do "Book physio"
    When I change "Book physio" to a daily habit
    Then the "Health" list shows "Walk", "Water", "Book physio" in that order before any to-dos

  @edge-case
  Scenario: A habit that becomes a to-do leaves the habits' order
    Given "Health" has the habits "Walk", "Fix bike" and "Water"
    When I change "Fix bike" to a to-do
    Then the habits read "Walk", "Water" and "Fix bike" is listed with the to-dos

  @edge-case
  Scenario: Changing type and list in one save
    Given the daily habit "Gym" in "Health"
    When I choose "Weekly goal", pick 3, choose the list "Personal" and tap "Save"
    Then "Gym" is a weekly goal at the end of "Personal"'s habits

  @edge-case
  Scenario: Changing a habit to a to-do on its own page goes back
    Given I am on the page of the daily habit "Fix bike", opened from Today
    When I change it to a to-do and confirm
    Then Today is displayed and "Fix bike" is an open to-do there

  @edge-case
  Scenario: A goal that was weekly before keeps its old target for old weeks
    Given "Run" was a weekly goal with 4 per week until the week of 2026-09-27 and has been a daily habit since
    When I change "Run" back to a weekly goal with 2 per week
    Then the week of 2026-09-27 keeps the target 4 and this week's target is 2

  @edge-case
  Scenario: A habit with no check-ins becomes a weekly goal from this week
    Given the daily habit "New thing" has no check-ins
    When I change it to a weekly goal with 5 per week
    Then its target is 5 from the week of 2026-10-11

  @edge-case
  Scenario: Today's daily check-in counts once as a weekly log
    Given the daily habit "Gym" was done today
    When I change it to a weekly goal with 3 per week
    Then Today shows "Gym" at 1 of 3

  @edge-case
  Scenario: Unchecking today on a former weekly goal clears the whole day
    Given "Run" was logged twice today as a weekly goal and is now a daily habit
    When I tap its circle on Today
    Then "Run" is not done today and storage holds no check-ins for today

  # --- Errors ---

  @error
  Scenario: A failed type change keeps the old type
    Given IndexedDB rejects the next write
    When I change "Gym" from a daily habit to a weekly goal
    Then the sheet stays open with "Couldn't save. Your phone may be out of storage."
    And "Gym" is still a daily habit in storage with no target

  @error
  Scenario: A weekly goal needs a valid target
    When the repository is asked to change "Gym" to a weekly goal with target 0
    Then it returns the error "Pick 1 to 14 times a week" and nothing changes

  @error
  Scenario: An unknown type is refused
    When the repository is asked to change "Gym" to the type "monthly"
    Then it returns the error "Pick daily, weekly or to-do" and nothing changes

  @error
  Scenario: A deleted item cannot change type
    Given "Gym" is in Recently deleted
    When the repository is asked to change its type
    Then it returns the error "Habit not found"

  # --- Security ---

  @security
  Scenario: Names stay plain text in the confirmation
    Given the daily habit named "<b>Gym</b>"
    When I change it to a to-do and tap "Save"
    Then the confirmation shows "<b>Gym</b>" as text with no bold element

  @security
  Scenario: A type change sends nothing anywhere
    When I change "Gym" to a weekly goal
    Then no network request is made

  # --- Performance ---

  @performance
  Scenario: Changing a habit with three years of check-ins stays quick
    Given the daily habit "Read" has 1,100 check-ins
    When I change it to a weekly goal with 5 per week
    Then the sheet closes with the time recorded as a test annotation and a pathological ceiling of 5 seconds
    And storage still holds 1,100 check-ins

  # --- Integration ---

  @integration
  Scenario: A backup after a type change restores the new type and all history
    Given "Gym" was changed from a daily habit to a weekly goal with 3 per week
    When I export a backup and restore it
    Then "Gym" is a weekly goal with 3 per week and the same check-ins

  @integration
  Scenario: The History tab follows the new type
    Given "Gym" was changed from a daily habit to a weekly goal
    When I open the History tab
    Then "Gym" shows its streak in weeks

  @custom-accessibility
  Scenario: The Type switch in Edit is a labelled radio group
    Then the Type switch in Edit is a group labelled "Type" whose options are radio buttons at least 44 pixels tall, and the confirmation question is announced as an alert

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then the repository's update returns Result<T> for a type change and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then the confirmation wording lives in src/domain, the type change happens in one transaction in src/data/items-repo.ts, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
