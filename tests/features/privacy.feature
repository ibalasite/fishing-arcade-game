Feature: PDPA Privacy Compliance
  # DOC-REF: TEST-PLAN §3.7 — TC-PRIV-001, TC-PRIV-002, TC-PRIV-003, TC-PRIV-004
  # Covers: consent grant/revoke, account deletion anonymisation, cancellation, atomic email update

  Background:
    Given a real PostgreSQL instance is available via Testcontainers
    And the database has been migrated
    And a user exists with email "user@test.invalid" (encrypted) and an active account status

  Scenario: User grants and revokes marketing consent
    # TC-PRIV-001
    Given the user has no existing consent records
    When "POST /api/v1/privacy/consent/grant" is called with "consentType" = "marketing"
    Then "user_consents" contains one row for this user with "granted" = true and "revoked_at" IS NULL
    When "POST /api/v1/privacy/consent/revoke" is called with "consentType" = "marketing"
    Then "user_consents" contains a second row for this user with "granted" = false and "revoked_at" IS NOT NULL
    And "GET /api/v1/privacy/consents" returns a response with "marketingConsent" = false

  Scenario: Account deletion anonymises email AND email_hash
    # TC-PRIV-002 — GATE-PDPA (blocks merge)
    Given a "deletion_requests" row exists for the user with "scheduled_for" in the past
    And "executed_at" IS NULL and "cancelled_at" IS NULL for that request
    When "PrivacyService.executeScheduledDeletions()" is called
    Then "users.email" is updated to the encrypted value of a string matching "deleted_XXXXXXXX@deleted.invalid"
    And "users.email_hash" is updated to the HMAC of the new anonymised email (not the original email hash)
    And "users.nickname" is updated to a string matching "deleted_XXXXXXXX"
    And "users.deletion_status" equals "deleted"
    And "deletion_requests.executed_at" IS NOT NULL
    And "transactions" rows for this user still exist (7-year retention policy)
    And "user_consents" rows for this user still exist (PDPA evidence retention)

  Scenario: Deletion cancellation before scheduled execution
    # TC-PRIV-003
    Given the user has a pending "deletion_requests" row with "cancelled_at" IS NULL and "executed_at" IS NULL
    When "DELETE /api/v1/privacy/account/delete" is called (cancelDeletion)
    Then "deletion_requests.cancelled_at" IS NOT NULL
    And "users.deletion_status" equals "active"
    And "users.email" remains unchanged
    And "users.nickname" remains unchanged
    When "PrivacyService.executeScheduledDeletions()" is called subsequently
    Then the user is skipped because the "deletion_requests" row has "cancelled_at" IS NOT NULL
    When "DELETE /api/v1/privacy/account/delete" is called a second time
    Then the response status is HTTP 409 with error code "deletion_not_cancellable"

  Scenario: Email update updates both email and email_hash atomically
    # TC-PRIV-004
    Given the user has email "old@test.invalid" (encrypted) and a corresponding "email_hash"
    And a Redis confirmation token "email_confirm:<token>" is set with value "<userId>:new@test.invalid"
    When "PATCH /api/v1/user/profile" is called with "email" = "new@test.invalid" (initiating email change)
    And the confirmation link is followed via "GET /api/v1/auth/confirm-email?token=<token>"
    Then "users.email" equals the encrypted value of "new@test.invalid"
    And "users.email_hash" equals the HMAC of "new@test.invalid" using HMAC_SECRET_KEY
    And both columns are updated in the same database transaction
    And the Redis confirmation token "email_confirm:<token>" is deleted
    And the old "email_hash" value is no longer present on the user row
