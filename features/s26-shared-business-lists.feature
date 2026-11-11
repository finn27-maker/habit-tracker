# Several businesses on one list: Memento plan node dbcc4dca (sub-idea 7aedbc32) / scenario set 215e4a26
# Developermgr requests Voicetranscription-20261110-232528 and -233100 (approved by the owner): a
# bizlending and a developermanager to-do landed in Assistant. Cause: the Personal Assistant feed
# never forwards business_id/business_name and routes by fixed list names. The durable fix needs
# the intake to forward the fields, and Habit Tracker to allow one list per several businesses,
# because MWCN and WTA both file into Boards. Owner approved 2026-11-11 ("continue").
# Amends s23-business-lists "A name match does not take a list linked to another business".
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Several Scribe businesses on one list
  As a habit tracker owner,
  I need one list to hold to-dos for several Scribe businesses
  so that MWCN and WTA both file into Boards and every business keeps working after renames.

  Background:
    Given the app is paired and has the lists "Personal", "Bills & Deadlines", "Biz Lending Strategy", "Work", "Lxthr Garage", "Boards" and "Assistant"

  # --- Sharing a list ---

  @happy-path
  Scenario: Two businesses that name the same list share it
    When a to-do arrives with business_id "mwcn" and business_name "Boards", then one with business_id "wta" and business_name "Boards"
    Then both are in "Boards", the list "Boards" belongs to "mwcn" and "wta", and no list is added

  @happy-path
  Scenario: Later to-dos for either business keep using the shared list
    Given "Boards" belongs to "mwcn" and "wta"
    When to-dos arrive for "mwcn" and for "wta"
    Then both are in "Boards"

  @happy-path
  Scenario: A shared list renamed on the phone keeps both businesses
    Given "Boards" belongs to "mwcn" and "wta"
    When I rename it "Boards & Councils" and to-dos arrive for "mwcn" and "wta" with business_name "Boards"
    Then both are in "Boards & Councils" and no list named "Boards" is added

  @happy-path
  Scenario: An existing list is adopted by its current name
    When a to-do arrives with business_id "bizlending" and business_name "Biz Lending Strategy"
    Then it is in "Biz Lending Strategy" and that list now belongs to "bizlending"

  @happy-path
  Scenario: A brand-new business still gets its own list
    When a to-do arrives with business_id "developermanager" and business_name "Developer Manager"
    Then a 💼 blue list "Developer Manager" belonging to "developermanager" is added after "Assistant" and holds it

  # --- Edge cases ---

  @edge-case
  Scenario: A list keeps each business only once
    Given "Boards" belongs to "mwcn"
    When five more to-dos arrive for "mwcn"
    Then "Boards" belongs to "mwcn" exactly once

  @edge-case
  Scenario: A business already linked elsewhere is not moved by a name match
    Given "Work" belongs to "keybank"
    When a to-do arrives with business_id "keybank" and business_name "Boards"
    Then it is in "Work" and "Boards" does not gain "keybank"

  @edge-case
  Scenario: A list linked before this update still works
    Given "Lxthr Garage" was linked to "lxthrgarage" with the single-business link of the previous version
    When a to-do arrives for "lxthrgarage" and later one for "garage2" with business_name "Lxthr Garage"
    Then both are in "Lxthr Garage" and it belongs to "lxthrgarage" and "garage2"

  @edge-case
  Scenario: To-dos without a business still use the list name, then Assistant
    When a to-do arrives with list "Work" and no business_id, and another with list "Nowhere"
    Then the first is in "Work" and the second in "Assistant"

  @error
  Scenario: A delivery that can't be saved changes no list
    Given IndexedDB rejects the save
    When to-dos arrive for "mwcn" and "wta"
    Then no list gains a business, no to-do is saved and nothing is acknowledged

  # --- Safety ---

  @security
  Scenario: Business ids stay data, never markup
    When a to-do arrives with business_name "<img src=x onerror=alert(1)>"
    Then the new list's name shows as text and no image element is created

  @security
  Scenario: Removing a business in Scribe deletes nothing
    Given "Boards" belongs to "mwcn" and "wta"
    When Scribe stops sending "wta"
    Then "Boards" and its to-dos stay

  # --- Backups and performance ---

  @integration
  Scenario: A restore keeps every business on a shared list
    Given "Boards" belongs to "mwcn" and "wta" and is renamed "Boards & Councils"
    When I export a backup, restore it, and to-dos arrive for "mwcn" and "wta"
    Then both are in "Boards & Councils" and no list is added

  @integration
  Scenario: Backups from the previous version still restore their link
    Given a backup whose list "Lxthr Garage" has the single link "lxthrgarage"
    When I restore it
    Then "Lxthr Garage" belongs to "lxthrgarage"

  @performance
  Scenario: 50 to-dos across 10 businesses sharing 5 lists save quickly
    When one delivery holds 50 to-dos for 10 businesses, two per existing list
    Then no list is added, each of the 5 lists belongs to its 2 businesses, and the save takes under 2 seconds in the unit test

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
    Then choosing the list stays in src/data/assistant-repo.ts, reading the link stays in one helper, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
