# Deferred Work

## Deferred from: code review of spec-1-4-transaction-signing-submission-cip-8-data-signing (2026-10-06)

- **Finding**: `executeRpc` ERR_USER_REJECTED double-handle cho non-PostMessage transports [`src/core/client.ts:261-266`](file:///c:/Users/DELL/OneDrive/Máy%20tính/hydraone-sdk/src/core/client.ts#L261-L266)
- **Type**: `defer`
- **Severity**: `low`
- **Rationale**: Pre-existing defense-in-depth pattern. Khi các transport thứ ba hoặc MockTransport được mở rộng trong story 1.5/5.1, pattern này sẽ được audit và bổ sung test coverage đầy đủ hơn.

## Deferred by User Request (2026-10-08)

- **Item**: Story 4.4: Phaser 3 Event Emitter Game Plugin (`@hydraone/sdk/phaser`)
- **Type**: `defer`
- **Rationale**: Tạm hoãn triển khai plugin Phaser 3 theo yêu cầu người dùng để ưu tiên chuyển sang triển khai Epic 5 (Local Dev Sandbox, Simulator DevTools & Health Diagnostics). Story 4.4 được chuyển về trạng thái backlog.

