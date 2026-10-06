# Deferred Work

## Deferred from: code review of spec-1-4-transaction-signing-submission-cip-8-data-signing (2026-10-06)

- **Finding**: `executeRpc` ERR_USER_REJECTED double-handle cho non-PostMessage transports [`src/core/client.ts:261-266`](file:///c:/Users/DELL/OneDrive/Máy%20tính/hydraone-sdk/src/core/client.ts#L261-L266)
- **Type**: `defer`
- **Severity**: `low`
- **Rationale**: Pre-existing defense-in-depth pattern. Khi các transport thứ ba hoặc MockTransport được mở rộng trong story 1.5/5.1, pattern này sẽ được audit và bổ sung test coverage đầy đủ hơn.
