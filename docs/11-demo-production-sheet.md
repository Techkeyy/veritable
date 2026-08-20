# Three-minute demo production sheet

Target length: **2:45–3:00**. Record at 1920x1080, browser zoom near 100%. Hide bookmarks, wallet history, notifications, terminals containing credentials, and unrelated tabs. Preload every BOTScan tab before recording so explorer latency does not eat the take.

Tone: a business pitch, not a code walkthrough. The viewer is a judge who has watched twenty submissions today. Lead with the problem, let the slash land as the climax, close on proof.

---

## Shot list

| Time | Screen | Spoken |
|---:|---|---|
| 0:00–0:22 | Landing hero, no wallet connected | *"Tokenized real world assets can prove a token exists. They cannot prove the asset actually earned the income being paid out. Today, when a platform tells you it collected this month's rent, you are trusting the issuer's word. Veritable makes that income prove itself before anyone gets paid."* |
| 0:22–0:45 | Marketplace, scroll one offering | *"This is a live property offering on BOT Chain. Anyone can browse it without connecting a wallet, and anyone can invest. Investors hold a token that entitles them to a share of the rent. The question every one of them should ask is simple: did the rent actually arrive?"* |
| 0:45–1:20 | Issuer submits claim, evidence upload | *"Here an issuer reports income. They upload the lease statement and point to the payment. But nothing is distributed yet. The money goes into escrow, and the claim goes to verification. This is the firewall. Reporting income and receiving money are now two different events."* |
| 1:20–1:55 | Report view, eight rules expanded | *"An AI model reads the document and extracts the amount and the due date. It does not decide anything. Eight deterministic rules decide. The extracted terms have to match what was registered. A real on chain payment has to exist, from the right payer, for the right amount, inside the right window. All eight pass, so this claim is verified, and exactly the escrowed amount is released."* |
| 1:55–2:30 | **Climax.** Challenge, overturn, slash on BOTScan | *"Now the case that matters. Here a verifier approved a claim that was false. Anyone can challenge an attestation during the public window. A challenger did. The resolver overturned it. The verifier lost two BOT of its own stake, investors received nothing, and the blocked escrow went back to the issuer. That is the difference between an AI that gives an opinion and an AI that is financially accountable for it."* |
| 2:30–2:50 | BOTScan mainnet, roles view | *"Veritable is deployed on BOT Chain Mainnet. The temporary deployer renounced every admin role after setup, so admin, guardian, resolver and verifier sit on four separate addresses. The verifier is bonded with real BOT before it can attest to anything."* |
| 2:50–3:00 | Repo and public URL | *"Sixty automated tests, forty six live checks against the deployed chain, and every claim in the README backed by a transaction. Veritable. Proof of income before distribution."* |

---

## The one line to land

If only one sentence survives, make it this one, delivered slowly over the slash:

> *"The verifier lost its own money for being wrong."*

Everything else in the product exists to make that sentence true.

---

## Capture checklist

- Fresh browser profile or logged out window for the opening two shots.
- Show at least one full transaction hash on screen, unblurred.
- Label the false approval explicitly as an intentional adversarial test. Never let it look like a live failure.
- Do not show `.env`, any terminal containing keys, or the disposable wallet's private key.
- Pause on the eight rule list. Let the viewer read three or four of them.
- Speak slowly. Two and a half clean minutes beats three rushed ones.

## Honesty guardrails

These are non negotiable. Misrepresenting materials is a disqualification risk, and the real story is strong enough without it.

- The walkthrough runs on BOT Testnet. Say so once, plainly, in the mainnet segment: *"The walkthrough you just saw runs on Testnet, where the full evidence history lives. The protocol itself is deployed on Mainnet."*
- Do not imply bank connectivity. The payment rail is an on chain transfer plus a live model extraction.
- Do not claim KYC, AML, legal title verification, or a secondary market. None of those are built.
- If a Mainnet claim settles before you record, replace the 2:30–2:50 segment with that settlement and drop the Testnet disclaimer for that shot only.

## Reference facts, all verifiable

| Claim | Evidence |
|---|---|
| Canonical claim, eight rules, VERIFIED | `0x1b547def2d1d6be5c508e357650fdd7366bd21b1b44ceb11c4e503b6d7a69c1a` |
| Live model extraction | provider run `225f8070-c374-4289-80ad-705b0ee40f2d` |
| Underlying income payment | https://scan.bohr.life/tx/0x559cb6f46a80411165bb3cfc2d61bd666b4121d6879a4a773c54819bf5a5eced |
| Bonded attestation | https://scan.bohr.life/tx/0x3512484dc5615a98147a9403d6ad520ea3e7ada8ae0b863c77cc324d68598224 |
| Settlement | https://scan.bohr.life/tx/0x8b79c17993c6b7db401bd2275934134b5eebb2e2bd1217fd058a0e46e1afb96d |
| Challenge | https://scan.bohr.life/tx/0x275cf40d0ffba0a2ee6bfd5a1e489276516bdcb5f1c14ddc66136e14bd77d73a |
| Overturn and slash, 5 to 3 tBOT | https://scan.bohr.life/tx/0x82318cab75659f149e73b575848befc7c65ff2954a3ac67f0b966d7b699afb56 |
| Blocked escrow refunded, 1,500 USDT | https://scan.bohr.life/tx/0x32f1a7afffacd1b55ad67bfe1c67f5f57af6f170422cf5b9d4917514f33264b1 |
| Mainnet deployment, chain 677 | `deployments/bot-mainnet/manifest.json`, block 20300480 |
| Mainnet role separation | deployer holds `DEFAULT_ADMIN_ROLE` on none of the four core contracts |
| Test and audit counts | 60 tests, 46 of 46 live checks |
