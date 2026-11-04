# Business lists from Scribe: Memento plan node 65ea704f (sub-idea 7aedbc32) / scenario set 02875710
# Request 2026-11-04 from the Scribe session (Note 2), agreed by the owner: "yes, build it with 💼 and blue".
# Scribe adds business_id (same rules as to-do ids, up to 64) and business_name (up to 40) to each to-do.
# Habit Tracker links a list to each business id, so renames on either side keep working.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Lists for Scribe businesses
  As a habit tracker owner,
  I need to-dos for each Scribe business to land in a list linked to that business
  so that a new business needs no manual setup anywhere.

  Background:
    Given the app is paired with the assistant and has the lists "Health", "Home", "Work" and "Personal"

  # --- Linking ---

  @happy-path
  Scenario: A new business gets its own list
    When a to-do "Order shop signage" arrives with business_id "lxthrgarage" and business_name "Lxthr Garage"
    Then a list "Lxthr Garage" with emoji "💼" and color blue is added after "Personal", linked to "lxthrgarage", and holds "Order shop signage"

  @happy-path
  Scenario: Later to-dos for the business use the same list
    Given the list "Lxthr Garage" is linked to "lxthrgarage"
    When a to-do "Call the landlord" arrives with business_id "lxthrgarage" and business_name "Lxthr Garage"
    Then "Call the landlord" is in "Lxthr Garage" and the app still has exactly one list linked to "lxthrgarage"

  @happy-path
  Scenario: An existing list with the business's name is adopted, not duplicated
    Given a list "Personal" that is not linked to any business
    When a to-do "Renew passport" arrives with business_id "personal" and business_name "personal"
    Then "Renew passport" is in "Personal", "Personal" is now linked to "personal", and no list is added

  @happy-path
  Scenario: Renaming the list on the phone keeps it linked
    Given the list "Lxthr Garage" is linked to "lxthrgarage"
    When I rename it to "Garage 🚗" and a to-do arrives with business_id "lxthrgarage" and business_name "Lxthr Garage"
    Then the to-do is in "Garage 🚗" and no list named "Lxthr Garage" is added

  @happy-path
  Scenario: Renaming the business in Scribe keeps the same list
    Given the list "Lxthr Garage" is linked to "lxthrgarage"
    When a to-do arrives with business_id "lxthrgarage" and business_name "Lxthr Garage LLC"
    Then the to-do is in "Lxthr Garage" and the list keeps the name "Lxthr Garage"

  # --- Edge cases ---

  @edge-case
  Scenario: Two to-dos for one new business in one delivery share one list
    When one delivery holds "A" and "B", both with business_id "wta" and business_name "WTA"
    Then exactly one list "WTA" is added and it holds "A" and "B"

  @edge-case
  Scenario: A name match does not take a list linked to another business
    Given the list "Work" is linked to "keybank"
    When a to-do arrives with business_id "work2" and business_name "Work"
    Then a new list "Work" linked to "work2" holds it, and the original "Work" stays linked to "keybank"

  @edge-case
  Scenario: A deleted business list is made again
    Given the list "WTA" was linked to "wta" and then deleted
    When a to-do arrives with business_id "wta" and business_name "WTA"
    Then a new 💼 blue list "WTA" linked to "wta" holds it

  @edge-case
  Scenario: A missing business name uses the business id
    When a to-do arrives with business_id "mwcn" and no business_name
    Then a list "mwcn" linked to "mwcn" holds it

  @edge-case
  Scenario: A business name longer than 40 characters is shortened
    When a to-do arrives with business_id "long" and a 60-character business_name
    Then the new list's name is the first 39 characters followed by "…", 40 characters in all

  @edge-case
  Scenario: To-dos without business fields work as before
    When a to-do arrives with list "work" and no business_id
    Then it is in "Work", and a to-do with an unknown list name goes to "Assistant"

  @error
  Scenario: An invalid business id is ignored
    When a to-do arrives with business_id "bad id!" and list "work"
    Then it is in "Work" and no list is linked to "bad id!"

  @error
  Scenario: A delivery that can't be saved adds no list
    Given IndexedDB rejects the save
    When a to-do arrives for a new business
    Then no list is added, no to-do is saved, and nothing is acknowledged, so the next sync tries again

  # --- Safety ---

  @security
  Scenario: A business name is plain text
    When a to-do arrives with business_name "<img src=x onerror=alert(1)>"
    Then the list name shows as text on the Lists tab and no image element is created

  @security
  Scenario: Removing a business in Scribe deletes nothing
    Given the list "WTA" is linked to "wta"
    When Scribe stops sending business "wta"
    Then the list "WTA" and its to-dos stay

  # --- Backups and performance ---

  @integration
  Scenario: A restore keeps the link to the business
    Given the list "Lxthr Garage" is linked to "lxthrgarage" and renamed "Garage 🚗"
    When I export a backup, restore it, and a to-do arrives for "lxthrgarage"
    Then the to-do is in "Garage 🚗" and no list is added

  @integration
  Scenario: A backup from before this update still restores
    Given a backup file whose lists have no business link
    When I restore it
    Then every list comes back unlinked and later to-dos adopt them by name

  @performance
  Scenario: A delivery of 50 to-dos across 10 new businesses saves quickly
    When one delivery holds 50 to-dos for 10 new businesses
    Then exactly 10 lists are added and the save takes under 2 seconds in the unit test

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then saving business to-dos goes through the assistant repository's Result<T> and never throws for expected failures

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then parsing the business fields stays in src/domain/assistant.ts and choosing the list stays in src/data/assistant-repo.ts, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
