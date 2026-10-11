# S1 walking skeleton: Memento plan node 3a9aed9d / sub-idea 9b5eb9b6 / scenario set 49534cdd
# Refines the @S1 scenarios in habit-tracker.feature with the behaviour found during iPhone testing.
# Architecture note: client-only PWA by user decision 0e39a594 (SSR preference waived for this project).

Feature: Installable offline app shell
  As a habit tracker user,
  I need the app installed on my iPhone Home Screen and working offline
  so that I can open it like a native app anywhere, and every later feature reaches me automatically.

  Background:
    Given the app is deployed to "https://finn27-maker.github.io/habit-tracker/"

  # --- Happy path ---

  @happy-path
  Scenario: The Home Screen app opens to an empty Today screen
    Given the app is installed to the iPhone Home Screen
    When I launch it from the Home Screen icon
    Then the "Today" heading is displayed within 1000 ms
    And the message "Nothing here yet. Tap + to add your first habit or to-do." is displayed

  @happy-path
  Scenario: The app confirms when it is saved for offline use
    Given I open the installed app while online for the first time
    When the service worker finishes precaching
    Then a status toast reads "✓ Ready to work offline"
    And tapping "OK" hides the toast

  @happy-path
  Scenario: The app relaunches offline after it is ready
    Given I have seen "Ready to work offline"
    And Airplane Mode is on and Wi-Fi is off
    When I relaunch the installed app
    Then the "Today" heading is displayed

  @happy-path
  Scenario: A new version is offered with a reload prompt
    Given a newer build has been deployed
    When I open the installed app while online
    Then a status toast reads "New version available" with buttons "Not now" and "Reload"
    And tapping "Reload" activates the new build

  @happy-path
  Scenario: The update prompt takes priority over the offline-ready note
    Given an update is waiting and the offline copy is ready
    When the toast is shown
    Then it reads "New version available"

  # --- Edge cases ---

  @edge-case
  Scenario: Safari-tab visitors are told to install
    Given I open the URL in a Safari tab where navigator.standalone is false
    Then a banner reads "Add to Home Screen to keep your data safe. Tap Share, then Add to Home Screen."

  @edge-case
  Scenario: The install banner is hidden inside the installed app
    Given navigator.standalone is true
    Then no "Add to Home Screen" banner is displayed

  @edge-case
  Scenario: Persistent storage is requested exactly once
    Given the app has never been opened on this device
    When I open the app and then reload it
    Then navigator.storage.persist() has been called exactly 1 time

  @edge-case
  Scenario: Missing Storage API does not break launch
    Given navigator.storage is undefined
    When the app starts
    Then the persistence request resolves to "unsupported"
    And the "Today" heading is displayed

  # --- Error handling ---

  @error
  Scenario: A declined persistence request is tolerated
    Given navigator.storage.persist() resolves to false
    When the app starts
    Then the persistence request resolves to "denied"
    And the "Today" heading is displayed

  @error
  Scenario: Offline launch makes no update check that would trigger the iOS network alert
    Given the app has been precached
    And navigator.onLine is false
    When I relaunch the app
    Then 0 requests are made for "/habit-tracker/sw.js"
    And registration runs once when the "online" event fires

  # --- Integration ---

  @integration
  Scenario: The manifest is scoped to the GitHub Pages path
    When I request "/habit-tracker/manifest.webmanifest"
    Then the response status is 200
    And start_url is "/habit-tracker/" and scope is "/habit-tracker/" and display is "standalone"

  @integration
  Scenario: Build verification and test coverage >=95% gate every deploy
    When a commit is pushed to main
    Then lint, svelte-check, Vitest with at least 95% line and branch coverage, Playwright and the build all exit 0
    And the deploy-pages job runs only after the test job succeeds

  # --- Security ---

  @security
  Scenario: Only the app's own scripts run
    When the Today screen loads
    Then the Content-Security-Policy contains "script-src 'self'"
    And 0 inline script elements exist
    And every request goes to the app's own origin

  @security
  Scenario: The public repository holds no personal data
    When files are staged for a commit
    Then no file matching "*backup*.json" can be committed because .gitignore excludes it

  # --- Performance ---

  @performance
  Scenario: The bundle stays within budget
    When the production build runs
    Then the gzipped JavaScript totals under 100 KB

  # --- Memento rule assertions (adapted for TypeScript) ---

  @regression
  Scenario: BDD scenarios written before code; SOLID principles and Clean Architecture
    Given habit-tracker.feature was committed in 154e2da before any file under "src/"
    Then src/platform modules import nothing from src/ui
    And no production file under "src/" contains test doubles (No mocks in production code)

  @regression
  Scenario: Result-style returns and async cancellation (ServiceResult<T> pattern; Async/await with CancellationToken)
    When requestPersistenceOnce fails
    Then it resolves to a result value ("denied" or "unsupported") instead of throwing
    And long-running async work introduced in later slices accepts an AbortSignal

  @regression
  Scenario: Proactive observation of code issues
    When an issue such as a broken test is noticed
    Then it is reported in the same session, as with the persist e2e counter bug fixed during S1
