# Three-minute demo production sheet

Target length: **2:50–3:00**. Record at 1920×1080 with browser zoom near 100%. Hide bookmarks, personal wallet history, notifications, API keys, and unrelated tabs.

| Time | Screen | Narration | Proof to capture |
|---:|---|---|---|
| 0:00–0:20 | Veritable landing hero | “Tokenization proves ownership, not that the underlying asset earned the income being distributed. Veritable makes income prove itself.” | Public URL and tagline |
| 0:20–0:45 | Architecture strip / workflow | “An issuer escrows USDT. Signed evidence is reconciled into typed facts. Deterministic policy decides. A verifier bonds BOT behind the result.” | Evidence → policy → bond → vault flow |
| 0:45–1:25 | Fresh-wallet exact-payment flow | “This new wallet creates an asset, submits a 2,000-USDT claim, and authorizes the hosted verifier. The agent cannot release money directly.” | Wallet prompts, claim ID, six-rule report |
| 1:25–1:48 | Attestation and settlement on BOTScan | “The attestation opens a public challenge window. Only after it closes can the vault settle and release the exact snapshot entitlement.” | Attestation, settlement, withdrawal txs |
| 1:48–2:25 | Recorded adversarial evidence | “Here the verifier approved a false claim. A challenger bonded BOT, the resolver overturned it, the verifier lost 2 BOT, and the issuer recovered the blocked escrow only after delay.” | Challenge, slash, refund links; 5→3 tBOT |
| 2:25–2:43 | Trust/limitations section | “AI proposes structured facts; signed sources and deterministic policy decide; contracts enforce custody. The demo uses a clearly labeled sandbox payment rail.” | Limitations text |
| 2:43–2:58 | Source + Mainnet BOTScan | “The source, tests, public app, and BOT Chain transactions are reviewable. Mainnet uses official six-decimal USDT and separated operational roles.” | Public repository and final Mainnet manifest |

## Capture checklist

- Use a fresh browser profile or logged-out window for the read-only opening.
- Preload BOTScan tabs so explorer latency does not consume the recording.
- Show full transaction hashes at least once; avoid hovering over wallet extensions longer than necessary.
- Do not expose `.env`, terminals containing credentials, or the disposable-wallet private key.
- Keep the false-approval flow explicitly labeled as an intentional adversarial test.
- End on the public URL, source URL, and Mainnet explorer proof.

## Voiceover copy

“A token can exist on-chain while its reported income remains an issuer promise. Veritable places a yield firewall between that promise and investor funds. The issuer escrows USDT and commits evidence. A constrained agent reconciles signed records into typed facts, but deterministic policy—not an LLM—produces the verdict. A verifier then bonds BOT behind an EIP-712 attestation. Anyone can challenge it during the public window. Only a settled verified outcome unlocks snapshot-based withdrawals. In our exact-payment run, a fresh wallet escrowed 2,000 USDT and recovered exactly 2,000 after verification. In our adversarial run, a false approval was challenged and overturned: the verifier was slashed from five to three BOT, investors received zero, and the escrow was refunded only after delay. Veritable turns AI verification from advice into an economically accountable on-chain control. The demo uses signed sandbox evidence; production requires regulated data integrations, audits, multisig governance, and jurisdiction-specific compliance.”
