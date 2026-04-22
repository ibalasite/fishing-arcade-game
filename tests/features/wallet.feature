Feature: Dual Currency Wallet
  # DOC-REF: TEST-PLAN §3.6 — TC-CURR-001, TC-CURR-002
  # Covers: concurrent debit safety, IAP idempotency, diamond credit after IAP verification

  Background:
    Given a real PostgreSQL instance is available via Testcontainers
    And the database has been migrated
    And a user exists in the database with a seeded wallet

  Scenario: Concurrent shots do not cause double-debit
    # TC-CURR-001 — GATE-WALLET (blocks merge)
    Given the user's wallet has "gold" = 100
    When "WalletService.debitGold(userId, 100)" and "WalletService.debitGold(userId, 100)" are executed simultaneously via Promise.all
    Then exactly one debit succeeds and results in "gold" = 0
    And the other debit throws an "InsufficientFundsError"
    And "user_wallets.gold" is never negative
    And exactly one row is inserted into the "transactions" table

  Scenario: IAP receipt is idempotent (duplicate receipt returns same balance)
    # TC-CURR-002
    Given the user's wallet has "diamond" = 0
    And the external IAP verifier is mocked to return success for "receiptHash" = "sha256-abc123"
    When "POST /api/v1/iap/verify" is submitted with the same receipt data twice sequentially
    Then the first submission returns HTTP 200 and "diamond" is incremented by "diamondAmount"
    And the second submission returns HTTP 200 without incrementing "diamond" again
    And "iap_receipts" contains exactly one row for "receipt_hash" = "sha256-abc123"

  Scenario: Diamond credit after successful IAP verification
    # TC-CURR-002 (first-time happy path)
    Given the user's wallet has "diamond" = 0
    And the external IAP verifier is mocked to return success for receipt "sha256-newreceipt-001" with "diamondAmount" = 100
    When "POST /api/v1/iap/verify" is submitted with the new receipt data
    Then the response status is HTTP 200
    And "user_wallets.diamond" equals 100
    And one row is inserted into "iap_receipts" with "receipt_hash" = "sha256-newreceipt-001"
    And one row is inserted into "transactions" with "type" = "iap_purchase"
