@e2e @accessibility @a11y
Feature: Accessibility
  As a player with accessibility needs
  I want the fishing arcade game UI to be fully navigable via keyboard and screen reader
  So that I can enjoy the game regardless of my input method or assistive technology

  Background:
    Given the game server is running at "http://localhost:7456"
    And the player has navigated to "http://localhost:7456"

  # E2E-A11Y-001 — Privacy consent modal has correct keyboard focus order
  Scenario: Privacy consent modal has correct keyboard focus order
    Given a fresh authenticated player with no prior consent record
    And the "privacy-consent-modal" is visible on screen
    And focus is positioned at the start of the modal
    When the player presses "Tab" once
    Then the "consent-checkbox" should receive keyboard focus
    When the player presses "Tab" again
    Then the "view-policy-link" should receive keyboard focus
    When the player presses "Tab" again
    Then the "consent-agree-btn" should receive keyboard focus
    When the player presses "Tab" again
    Then the "consent-disagree-btn" should receive keyboard focus
    When the player presses "Tab" again
    Then focus should cycle back to the first focusable element inside the modal
    And focus should NOT escape the modal (focus trap is active)
    When the player presses "Enter" while "consent-agree-btn" is focused
    Then the modal should close as if the agree button was clicked
    And focus should move to the next logical element outside the modal ("join-room-btn")

  # E2E-A11Y-002 — Jackpot odds modal is navigable by keyboard
  Scenario: Jackpot odds modal is navigable by keyboard
    Given the player is authenticated and in a "PLAYING" game room
    And the "jackpot-info-btn" is visible in the game HUD
    When the player presses "Tab" to navigate to "jackpot-info-btn"
    And the player presses "Enter" to open the jackpot odds modal
    Then the "jackpot-odds-modal" should open
    And focus should move into the modal automatically
    When the player navigates through the modal with "Tab"
    Then focus should move through all interactive elements in logical reading order:
      | order | element                  |
      | 1     | jackpot-odds-modal-title |
      | 2     | jackpot-odds-table       |
      | 3     | jackpot-odds-close-btn   |
    And the odds table rows should be navigable with arrow keys
    When the player presses "Escape"
    Then the "jackpot-odds-modal" should close
    And focus should return to the "jackpot-info-btn" that triggered the modal
    When the player presses "Enter" on "jackpot-odds-close-btn"
    Then the "jackpot-odds-modal" should close
    And focus should return to the "jackpot-info-btn"

  # E2E-A11Y-003 — VoiceOver/TalkBack accessibility labels are present on key buttons
  Scenario: VoiceOver/TalkBack accessibility labels are present on key buttons
    Given the player has navigated to the game lobby
    Then each key interactive element should have an accessible name (aria-label or visible text label):
      | element                   | expected accessible name pattern                   |
      | join-room-btn             | "加入房間" or "Join Room"                           |
      | cannon-fire-btn           | "發射" or "Fire Cannon"                             |
      | jackpot-info-btn          | "彩金資訊" or "Jackpot Information"                 |
      | consent-agree-btn         | "同意" or "Agree"                                   |
      | consent-disagree-btn      | "不同意" or "Disagree"                              |
      | iap-product-100           | "購買100鑽石" or "Buy 100 Diamonds"                 |
      | delete-account-btn        | "刪除帳號" or "Delete Account"                      |
      | marketing-consent-toggle  | "行銷通知同意" or "Marketing Notifications Consent" |
    And the "game-canvas" should have a descriptive "aria-label" attribute
    And modal dialogs should have "role=dialog" and "aria-modal=true"
    And modal dialogs should have "aria-labelledby" pointing to their title element
    And live-updating elements should use appropriate ARIA live regions:
      | element                   | aria-live value |
      | jackpot-pool-counter      | "polite"        |
      | gold-balance-display      | "polite"        |
      | diamond-balance           | "polite"        |
      | shoot-result-toast        | "assertive"     |
      | reconnecting-overlay      | "assertive"     |
