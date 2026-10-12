# Install hint and share button: Memento plan node 18b058d3 (sub-idea 12530093) / scenario set 1e4f0a90
# User request 2026-10-12: "let's do both" (an Add to Home Screen hint for new people, and a Share this
# app button). Chosen: a card on Today until dismissed, with steps for the visitor's phone and an
# Install button on Android; Share this app in the Lists tab above Backup.
# Revises s1-app-shell.feature "Safari-tab visitors are told to install": the banner was on every
# screen, iPhone-only and could not be dismissed. The iPhone wording is kept.
# Research: iOS Safari has no beforeinstallprompt, so iPhones get written steps only (caniuse
# wf-beforeinstallprompt). On iOS, share() with a text field makes the sheet's Copy action copy only
# the text, so the link goes inside the text (adactio.com/journal/15972). iPadOS reports a Mac user
# agent, so a touch screen with a Mac user agent counts as iPhone/iPad.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Help new people install the app and share it
  As a friend or family member opening the shared link,
  I need install steps for my phone on Today and a one-tap way to send the app to others
  so that my data is kept safe in the installed app and I can pass the app on.

  # --- Install card ---

  @happy-path
  Scenario: An iPhone browser tab shows the iPhone steps on Today
    Given I open the link in Safari on an iPhone and the app is not installed
    When Today is displayed
    Then a card labelled "Install this app" reads "Add to Home Screen to keep your data safe. Tap Share, then Add to Home Screen."
    And it also reads "Your data in a browser tab is separate from the installed app, and the browser may clear it after 7 days."
    And it has a "Got it" button and no "Install" button

  @happy-path
  Scenario: An Android browser tab shows the Android steps on Today
    Given I open the link in Chrome on an Android phone and the app is not installed
    When Today is displayed
    Then the card reads "Add to Home screen to keep your data safe. Tap ⋮, then Add to Home screen."

  @happy-path
  Scenario: Android offers a one-tap Install when Chrome allows it
    Given I am on Android and Chrome has offered to install the app
    When I tap "Install" on the card and accept Chrome's prompt
    Then the card is no longer displayed

  @happy-path
  Scenario: Got it hides the card for good
    Given the install card is displayed on Today
    When I tap "Got it"
    Then the card is no longer displayed
    And after reloading the page the card is still not displayed

  @happy-path
  Scenario: The installed app never shows the card
    Given the app is opened from the Home Screen icon
    When Today is displayed
    Then no card labelled "Install this app" is displayed

  @edge-case
  Scenario: The card shows only on Today
    Given I open the link in a browser tab and the app is not installed
    When I open the Lists tab, a list page, an item page and Recently deleted
    Then none of them shows the card labelled "Install this app"

  @edge-case
  Scenario: Declining Chrome's install prompt keeps the card
    Given I am on Android and Chrome has offered to install the app
    When I tap "Install" and dismiss Chrome's prompt
    Then the card is still displayed with its "Got it" button
    And the "Install" button is no longer displayed, because Chrome allows the prompt only once

  @edge-case
  Scenario: Installing from Chrome's own menu hides the card
    Given the install card is displayed in Chrome
    When Chrome reports the app was installed
    Then the card is no longer displayed

  @edge-case
  Scenario: An iPad counts as iPhone
    Given the browser reports a Mac user agent on a touch screen
    When Today is displayed
    Then the card shows the iPhone steps

  @edge-case
  Scenario: A computer browser gets general steps
    Given the browser is neither iPhone, iPad nor Android
    When Today is displayed
    Then the card reads "Install this app to keep your data safe. Use your browser's Install or Add to Home Screen option."

  @edge-case
  Scenario: The card sits above the backup reminder
    Given the install card and the backup reminder are both due
    When Today is displayed
    Then the install card comes before the backup reminder

  @error
  Scenario: Got it still works when the browser blocks saved settings
    Given the browser throws when the app saves that the card was dismissed
    When I tap "Got it"
    Then the card is no longer displayed for the rest of this visit
    And no error message is displayed

  # --- Share this app ---

  @happy-path
  Scenario: Share this app opens the share sheet with the link
    Given I am on the Lists tab
    When I tap "Share this app"
    Then the share sheet opens with the title "Habit Tracker" and the text "Try this habit and to-do tracker: https://finn27-maker.github.io/habit-tracker/"

  @happy-path
  Scenario: Without a share sheet the link is copied
    Given the browser has no share sheet
    When I tap "Share this app"
    Then "https://finn27-maker.github.io/habit-tracker/" is copied to the clipboard
    And the message "Link copied" is displayed

  @edge-case
  Scenario: Closing the share sheet does nothing else
    Given I am on the Lists tab
    When I tap "Share this app" and close the share sheet without choosing an app
    Then nothing is copied and no message is displayed

  @edge-case
  Scenario: The button sits above the Backup section
    When I open the Lists tab
    Then "Share this app" comes after the lists and before the "Backup" heading

  @error
  Scenario: A share sheet that refuses falls back to copying
    Given the browser's share sheet rejects with an error other than a cancel
    When I tap "Share this app"
    Then the link is copied and "Link copied" is displayed

  @error
  Scenario: When copying fails the link is shown to copy by hand
    Given the browser has no share sheet and copying to the clipboard fails
    When I tap "Share this app"
    Then the message "Copy this link: https://finn27-maker.github.io/habit-tracker/" is displayed

  # --- Security and privacy ---

  @security
  Scenario: The share message carries no personal data
    Given I have lists named "Fitness" and "Side Business" and 20 items
    When I tap "Share this app"
    Then the shared text contains only "Try this habit and to-do tracker:" and the app's link

  @security
  Scenario: The link is the app's own address
    Given the app is served from "https://finn27-maker.github.io/habit-tracker/"
    When I tap "Share this app" from a list page address such as "#/list/abc"
    Then the shared link is "https://finn27-maker.github.io/habit-tracker/" with no "#" part

  # --- Performance ---

  @performance
  Scenario: The card adds no wait to opening Today
    Given I open the link in a browser tab
    When Today is displayed
    Then the card is visible in the same render as the "Today" heading, with no network request

  # --- Integration ---

  @integration
  Scenario: Tapping Share this app keeps the backup section working
    Given I tapped "Share this app"
    When I tap "Back up now" in the Backup section
    Then the backup file is shared as before

  @accessibility
  Scenario: The card and button are labelled and large enough
    Then the card is a region labelled "Install this app", its buttons are at least 44 by 44 pixels, and "Link copied" is announced as a status

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code, Build verification and Test coverage >=95%
    Given this feature file was committed before the code that implements it
    Then Vitest meets the tiered coverage thresholds and lint, check, unit, e2e and build pass locally before pushing, and the Actions run is confirmed green after pushing

  @regression
  Scenario: No mocks in production code; ServiceResult<T> pattern; Async/await with CancellationToken
    Then sharing returns one of "shared", "copied", "shown" or "cancelled" instead of throwing

  @regression
  Scenario: SOLID principles and Clean Architecture
    Then phone detection and the share fallback live in src/platform with injected browser pieces, and src/domain imports nothing from src/data, src/platform or src/ui

  @regression
  Scenario: Proactive observation of code issues
    When a reviewer notices a god object, dead code, anti-pattern or broken test
    Then it is reported in the same session it is observed
