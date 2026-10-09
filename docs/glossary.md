English | [Tiếng Việt](./vi/glossary.md)

# Glossary

| Term                      | Meaning                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **App Center**            | The HydraOne web client that lists games and embeds them in iframes. In this SDK it is the "host shell".                              |
| **Host shell**            | The page that embeds the game, owns the wallet connection and answers SDK requests.                                                   |
| **Bridge**                | The message channel between the game and the host shell.                                                                              |
| **Handshake**             | The first exchange (`CLIENT_READY` then `HOST_ACK`) that marks the client as connected.                                               |
| **Transport**             | An object implementing `ITransport` that moves messages: `PostMessageTransport`, `DirectExtensionTransport` or `MockClientTransport`. |
| **Correlation ID**        | The `id` of a request, echoed as `requestId` in the response, used to match concurrent requests and answers.                          |
| **Origin**                | Scheme, host and port of a page, for example `https://alpha.hydraone.app`. Used to authenticate messages.                             |
| **CIP-30**                | The Cardano dApp-wallet web bridge standard (`window.cardano`).                                                                       |
| **CIP-8**                 | The Cardano message signing standard, used by `signData`.                                                                             |
| **COSE_Sign1 / COSE_Key** | The signature and public-key structures returned by CIP-8 signing (`signature` and `key`).                                            |
| **CBOR**                  | The binary encoding Cardano uses for transactions and values. The SDK passes it around as hex strings.                                |
| **Lovelace**              | The smallest unit of ADA. 1 ADA = 1,000,000 lovelace.                                                                                 |
| **UTxO**                  | Unspent transaction output.                                                                                                           |
| **Bech32**                | The text encoding of Cardano addresses (`addr1...`).                                                                                  |
| **Native asset**          | A non-ADA token identified by a policy ID and an asset name.                                                                          |
| **JWT**                   | JSON Web Token issued by your backend after verifying a CIP-8 signature.                                                              |
| **Challenge / nonce**     | A single-use string your server issues; the player signs it to prove wallet ownership.                                                |
| **Safari ITP**            | Intelligent Tracking Prevention, the WebKit feature that partitions or limits storage in third-party iframes.                         |
| **Host storage relay**    | Storage kept on the host shell and accessed over `postMessage`, which ITP cannot partition.                                           |
| **Standalone mode**       | The game runs outside an iframe and talks directly to a wallet extension.                                                             |
| **Mock host**             | `MockBridgeHost`, an in-memory stand-in for the host shell.                                                                           |
| **Dev shell**             | `initHydraDevShell`, a local copy of the App Center chrome that embeds your game.                                                     |
