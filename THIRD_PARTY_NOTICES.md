# Third-party notices

src/sera/precision.ts is adapted from Haruki Kondo's MIT-licensed
[SeraProtocol-Sample](https://github.com/mashharuki/SeraProtocol-Sample/tree/de12dc8883a7fb2cdf6dd318b3860311a7b8ae44/telegram-bot).
Source: telegram-bot/src/sera/precision.ts at de12dc8883a7fb2cdf6dd318b3860311a7b8ae44.
Changes: zero-decimal output correction and shorter error text; service boundary adds input/uint256 validation.
The rest of this bot is independently implemented. The relocated, unlicensed repository is not copied.

MIT License

Copyright (c) 2026 Haruki Kondo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Installed npm dependencies have their own license notices in their package directories.

## Phase 4 WalletConnect / Reown components

Portions © 2025 Reown, Inc. All Rights Reserved

The signing frontend bundles `@walletconnect/ethereum-provider` 2.25.0
(WalletConnect Community License), `@reown/appkit` 1.8.24 (Reown Community
License), and its UI components. The routing pass declares the already installed
`@reown/appkit-ui` 1.8.24 directly to reuse the Reown QR component. It adds no
second wallet SDK and changes no vendor source. That describes the first routing
pass; the later OKX-specific connector adds the separately attributed SDK below.
These packages are not covered by this repository's MIT license. Their full
agreements are installed in the corresponding package LICENSE.md files and
are collected by `npm run build` into `dist/web/THIRD_PARTY_LICENSES.txt`,
which is distributed with and linked from the signing interface. Preserve
that file, this attribution, vendor branding and applicable network requirements
when redistributing the web build. No SDK source modifications were made.

The installed agreements include commercial-license thresholds of 500 monthly
active users or 2,500,000 monthly RPC calls; the vendor may update thresholds.
Read the full applicable agreements and current [Reown terms](https://reown.com/terms-of-service)
before expanding usage. This application's independent code remains MIT;
dependency licenses do not grant permission to relabel the bundled SDK as MIT.

Other installed libraries, including viem, esbuild, grammY and their dependencies,
retain their own notices. The build collects those installed notices as well.

## OKX Connect Web3 connection transport

`@okxconnect/universal-provider` **1.9.1** and its dependency
`@okxconnect/core` **1.9.1** identify **OKX Wallet** as author and **MIT** as
license in their published npm metadata. They do not include a top-level
LICENSE file in these artifacts. No additional copyright holder/year is invented.
The build records their package metadata, includes the provider's published
bundled third-party `.LICENSE.txt` notices, and collects dependency license files
in `dist/web/THIRD_PARTY_LICENSES.txt`. Preserve the distributed notices when
redistributing. No vendor source files were modified.

Only the universal provider was added directly; `@okxconnect/ui` was not installed.
The SDK transports self-custodial Web3 wallet connection/session requests, not
exchange account access. Its dependencies retain their individual licenses.
See [OKX_CONNECT.md](OKX_CONNECT.md) for integration scope and dependency caveats.
