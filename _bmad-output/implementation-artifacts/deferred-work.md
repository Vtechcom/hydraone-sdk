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

## Deferred from: code review of client.ts (2026-10-09)

- **Finding**: Bổ sung các truy vấn CIP-30 còn thiếu (`GET_NETWORK_ID`, `GET_UNUSED_ADDRESSES`, `GET_CHANGE_ADDRESS`, `GET_REWARD_ADDRESSES`) vào `DirectExtensionTransport.handleMessageInternally` [`src/core/adapters/direct-extension-transport.ts:396`](file:///c:/Users/DELL/OneDrive/Máy%20tính/hydraone-sdk/src/core/adapters/direct-extension-transport.ts#L396)
- **Type**: `defer`
- **Severity**: `high`
- **Rationale**: Vấn đề nằm trong tệp adapter `DirectExtensionTransport` khi chạy chế độ standalone browser, nằm ngoài phạm vi tệp lõi `src/core/client.ts` được yêu cầu review.

