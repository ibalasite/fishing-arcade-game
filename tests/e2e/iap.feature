@e2e @iap @purchase
Feature: IAP Purchase UI
  As a player of the fishing arcade game
  I want to purchase diamonds through the in-app purchase flow
  So that I can top up my balance and use premium features

  Background:
    Given the game server is running at "http://localhost:7456"
    And the IAP API is available at "http://localhost:3000/api/v1/iap"
    And the player is authenticated and on the shop page at "http://localhost:7456/shop"

  # E2E-IAP-001 — Diamond purchase shows confirmation dialog
  Scenario: Diamond purchase shows confirmation dialog
    Given the player's diamond balance is shown as "0" in "diamond-balance"
    And the shop page displays available IAP products
    When the player clicks the "iap-product-100" button (100 Diamonds pack)
    Then the "iap-confirm-modal" should appear
    And the "iap-confirm-modal" should display the product name as "100 鑽石"
    And the "iap-confirm-modal" should display the correct price for the 100-diamond pack
    And the "iap-confirm-btn" should be present
    And the "iap-cancel-btn" should be present
    When the player clicks "iap-cancel-btn"
    Then the "iap-confirm-modal" should close without making any purchase
    And the "diamond-balance" should remain "0"
    When the player clicks the "iap-product-100" button again
    And the player clicks "iap-confirm-btn" to confirm the purchase
    Then the "iap-confirm-modal" should close
    And the "iap-success-toast" should appear within 5 seconds
    And the "diamond-balance" should update to "100"
    And the server should have credited 100 diamonds to the player's wallet
    And the IAP receipt should be stored to prevent duplicate crediting

  # E2E-IAP-002 — Failed IAP shows error and does not credit diamonds
  Scenario: Failed IAP shows error and does not credit diamonds
    Given the player's diamond balance is "0" in "diamond-balance"
    And the IAP verifier is configured to return a failure response for this test
    When the player clicks the "iap-product-100" button
    And the "iap-confirm-modal" appears
    And the player clicks "iap-confirm-btn" to confirm the purchase
    Then the "iap-confirm-modal" should close
    And the "iap-error-toast" should appear within 5 seconds
    And the "iap-error-toast" should display a user-friendly error message
    And the "iap-error-toast" should NOT expose internal server error details
    And the "diamond-balance" should remain "0" (no diamonds credited)
    And the server should NOT have inserted an iap_receipts row for this failed attempt
    And the player should be able to retry the purchase by clicking "iap-product-100" again
