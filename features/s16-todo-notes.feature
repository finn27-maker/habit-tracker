# To-do notes: Memento plan node bce62406 (sub-idea 4582edbd) / scenario set 3de8463c
# Passed on 2026-10-30 from the owner's Personal Assistant session: "if Scribe hears a vague due date
# like "next week," it sends that as a short note. Habit Tracker doesn't show notes yet."
# Found while checking: s15's parser keeps only id, title, list and due, so a note was dropped and the
# to-do still acknowledged. The owner chose: fix now, notes for every to-do, and accept the field as
# "note" or "notes" (Scribe's name for it is unconfirmed; "note" wins when both are sent).
# Amends s15-assistant-todos.feature: a received to-do now keeps its note.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).
# Today is Friday 2026-10-30 in America/Chicago.

Feature: Notes on to-dos
  As a habit tracker owner,
  I need a short note on any to-do, including what my assistant sends
  so that details like "next week" are never lost and I can turn them into a real date.

  # --- Seeing notes ---

  @happy-path
  Scenario: A note shows under the to-do's name on Today
    Given the to-do "Pay the plumber" due today has the note "next week"
    When I open Today
    Then "next week" is shown in small grey text under "Pay the plumber"

  @happy-path
  Scenario: A note shows on the list page too
    Given the to-do "Buy paint" in "Home" with no due date has the note "the blue one by the door"
    When I open the "Home" list page
    Then "the blue one by the door" is shown under "Buy paint"

  @happy-path
  Scenario: A note is shown on a completed to-do
    Given the to-do "Call mom" with the note "about Sunday" is checked off
    When I open its list's Completed section
    Then "about Sunday" is shown under "Call mom"

  @edge-case
  Scenario: A to-do without a note shows no empty line
    Given the to-do "Pay rent" has no note
    When I open Today
    Then the row for "Pay rent" has no note text and keeps its single-line height of 3.5rem

  @edge-case
  Scenario: A note keeps its line breaks
    Given the to-do "Groceries" has the note "milk" and "eggs" on two lines
    When I open Today
    Then the note shows "milk" and "eggs" on separate lines

  # --- Adding and editing ---

  @happy-path
  Scenario: Add a to-do with a note
    When I tap "+", type "Buy paint" as the name and "the blue one by the door" in "Notes" and tap "Save"
    Then "Buy paint" is listed with "the blue one by the door" under it

  @happy-path
  Scenario: Edit shows the note and can change it
    Given the to-do "Pay the plumber" has the note "next week"
    When I tap its name, change "Notes" to "after the 5th" and tap "Save"
    Then "after the 5th" is shown under "Pay the plumber"

  @happy-path
  Scenario: Turn an assistant's vague date into a real one
    Given the assistant sent "Pay the plumber" with no due date and the note "next week"
    When I tap its name, choose "Pick a date" 2026-11-04, clear "Notes" and tap "Save"
    Then "Pay the plumber" is due Nov 4 and no note is shown

  @edge-case
  Scenario: Clearing the note removes it from storage
    Given the to-do "Pay the plumber" has the note "next week"
    When I clear "Notes" in Edit and tap "Save"
    Then the stored to-do has no note field

  @edge-case
  Scenario: A note of only spaces counts as no note
    When I add the to-do "Pay rent" with "   " in "Notes"
    Then the stored to-do has no note field

  @edge-case
  Scenario: Notes are trimmed
    When I add the to-do "Pay rent" with "  by the 1st  " in "Notes"
    Then the stored note is "by the 1st"

  @error
  Scenario: A note longer than 200 characters is refused in the sheet
    When I add the to-do "Pay rent" with a 201-character note
    Then the sheet stays open with "Notes must be 200 characters or fewer"
    And nothing is saved

  @edge-case
  Scenario: The Notes field stops at 200 characters
    Then the "Notes" field accepts at most 200 characters

  @edge-case
  Scenario: Habits and weekly goals have no Notes field
    When I tap "+" and choose "Daily habit"
    Then no "Notes" field is displayed

  @edge-case
  Scenario: A note survives a type change and back
    Given the to-do "Fix bike" has the note "chain is loose"
    When I change it to a daily habit and then back to a to-do
    Then "chain is loose" is shown under "Fix bike"

  @custom-accessibility
  Scenario: The note is read with the to-do and the field is labelled
    Then the Edit button for a to-do is described by its note, and the field is a text area labelled "Notes" with text at least 16 px so iOS doesn't zoom

  # --- From the assistant ---

  @happy-path
  Scenario: A note sent as "note" is kept
    Given my paired assistant sends the to-do "Pay the plumber" with "note": "next week" and no due date
    When the app syncs
    Then "Pay the plumber" is saved with the note "next week"
    And it is acknowledged to the assistant

  @happy-path
  Scenario: A note sent as "notes" is kept too
    Given my paired assistant sends the to-do "Book dentist" with "notes": "sometime in November"
    When the app syncs
    Then "Book dentist" is saved with the note "sometime in November"

  @edge-case
  Scenario: "note" wins when both are sent
    Given the assistant sends "note": "next week" and "notes": "later"
    When the app syncs
    Then the saved note is "next week"

  @edge-case
  Scenario: A long assistant note is cut, not refused
    Given the assistant sends a 300-character note
    When the app syncs
    Then the to-do is saved with the first 199 characters of the note followed by "…"

  @edge-case
  Scenario: A note that isn't text is ignored but the to-do still arrives
    Given the assistant sends the to-do "Pay rent" with "note": 42
    When the app syncs
    Then "Pay rent" is saved with no note

  @edge-case
  Scenario: An empty assistant note is ignored
    Given the assistant sends "note": "  "
    When the app syncs
    Then the to-do is saved with no note

  @edge-case
  Scenario: A to-do received twice keeps its first note
    Given "Pay the plumber" with the note "next week" was received and acknowledged
    When the assistant sends the same to-do id again with the note "tomorrow"
    Then the stored note is still "next week" and only 1 to-do exists for that id

  @security
  Scenario: Control characters are removed from notes
    Given the assistant sends a note containing a null character and an escape character
    When the app syncs
    Then the saved note contains neither character, and line breaks are kept

  @security
  Scenario: Notes stay plain text
    Given a to-do has the note "<img src=x onerror=alert(1)>"
    When I open Today
    Then the note shows as text and no image element is created

  @security
  Scenario: Notes are never sent anywhere
    Given I am paired and a to-do has a note
    When the app syncs
    Then the only data sent to the assistant is the pairing code and the received ids

  # --- Backups ---

  @integration
  Scenario: Notes are in backups and come back on restore
    Given the to-do "Buy paint" has the note "the blue one by the door"
    When I export a backup and restore it on a fresh install
    Then "Buy paint" shows "the blue one by the door"

  @integration
  Scenario: A backup made before notes existed still restores
    Given a backup file whose to-dos have no note field
    When I restore it
    Then every to-do is restored with no note

  @error
  Scenario: A backup with a note that isn't text is refused as damaged
    Given a backup file where a to-do's note is 42
    When I try to restore it
    Then the message "This backup file is damaged and can't be restored." is displayed and nothing changes

  @error
  Scenario: A note that can't be saved is reported
    Given IndexedDB rejects the next write
    When I add the to-do "Buy paint" with a note
    Then the sheet stays open with "Couldn't save. Your phone may be out of storage."

  # --- Performance ---

  @performance
  Scenario: Today with 200 noted to-dos opens without a visible wait
    Given 200 to-dos due today, each with a 200-character note
    When I open Today
    Then all 200 notes are visible with the time recorded as a test annotation and a pathological ceiling of 15 seconds

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then saving a note goes through the repositories' Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then note cleaning and limits live in src/domain, used by the item repository, the assistant parser and the backup parser alike, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
