@e2e @privacy @pdpa
Feature: Privacy UI Flows
  As a player of the fishing arcade game
  I want clear and accessible privacy controls
  So that I can manage my data rights in compliance with PDPA regulations

  Background:
    Given the game server is running at "http://localhost:7456"
    And the privacy API is available at "http://localhost:3000/api/v1/privacy"

  # E2E-PRIV-001 — Privacy consent modal blocks game start until accepted
  Scenario: Privacy consent modal blocks game start until accepted
    Given a fresh authenticated player with no prior consent record
    When the player navigates to the game lobby at "http://localhost:7456"
    Then the "privacy-consent-modal" should be visible
    And the "join-room-btn" should be disabled
    And the "privacy-consent-modal" should display the privacy policy summary text
    And the "consent-agree-btn" should be present in the modal
    And the "consent-disagree-btn" should be present in the modal
    When the player clicks "view-policy-link"
    Then the "policy-content" panel should expand and show the full policy text
    When the player clicks "consent-disagree-btn"
    Then the "privacy-consent-modal" should remain visible
    And the "join-room-btn" should still be disabled
    When the player clicks "consent-agree-btn"
    Then the "privacy-consent-modal" should be hidden
    And the "join-room-btn" should be enabled
    And the player should be able to proceed to join a room

  # E2E-PRIV-002 — User revokes marketing consent in settings
  Scenario: User revokes marketing consent in settings
    Given an authenticated player who has previously granted "marketing" consent
    And the player is on the settings page at "http://localhost:7456/settings"
    When the player navigates to the "privacy-settings-section"
    Then the "marketing-consent-toggle" should be visible
    And the "marketing-consent-toggle" should show the current state as "enabled"
    When the player clicks the "marketing-consent-toggle" to revoke consent
    Then a "revoke-consent-confirm-dialog" should appear
    And the dialog should warn that marketing notifications will be disabled
    When the player confirms the revocation in "revoke-consent-confirm-dialog"
    Then the "marketing-consent-toggle" should update to show "disabled"
    And a "consent-update-success-toast" should appear confirming the change
    And the server should record the revocation with a "revoked_at" timestamp
    And subsequently the player should NOT receive marketing push notifications

  # E2E-PRIV-003 — Account deletion flow shows 30-day countdown
  Scenario: Account deletion flow shows 30-day countdown
    Given an authenticated player on the account settings page
    When the player navigates to "http://localhost:7456/settings/account"
    And the player clicks "delete-account-btn"
    Then the "account-deletion-modal" should appear
    And the modal should explain that deletion is scheduled for 30 days from now
    And the modal should show the exact scheduled deletion date in "deletion-scheduled-date"
    And the modal should show a "confirm-deletion-btn" and a "cancel-deletion-btn"
    When the player clicks "confirm-deletion-btn"
    Then the "account-deletion-modal" should close
    And a "deletion-scheduled-banner" should appear in the account settings page
    And the "deletion-scheduled-banner" should display a 30-day countdown timer
    And the "deletion-scheduled-banner" should display a "cancel-deletion-link"
    When the player clicks "cancel-deletion-link" within the 30-day window
    Then the "deletion-scheduled-banner" should disappear
    And a "deletion-cancelled-toast" should confirm the cancellation
    And the account should remain active with no anonymisation applied
