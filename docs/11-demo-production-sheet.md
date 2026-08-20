# Demo recording script

Target **2:45–3:00**. Record at 1920x1080, browser zoom near 100%. Read this top to bottom while recording. Each scene gives you the tab, the actions, and the exact words.

Tone is a business pitch, not a code walkthrough. The viewer is a judge who has already watched twenty submissions today.

---

## Before you press record

Open these nine tabs and leave them loaded. Switching tabs on camera is fine. Waiting for a page to load is not.

| Tab | URL | Pre-state |
|---|---|---|
| A | `/` | Logged out, scrolled to top |
| B | `/marketplace` | **Showing a real offering**, not "No listings yet" |
| C | `/app` | Wallet connected, on the **Report** job |
| D | `/app` | Second window, **Track** job, canonical claim already loaded |
| E | `scan.bohr.life/tx/0x275cf40d...` | Challenge |
| F | `scan.bohr.life/tx/0x82318cab...` | Overturn and slash |
| G | `scan.bohr.life/tx/0x32f1a7af...` | Refund |
| H | `scan.botchain.ai` | Mainnet attestationRegistry `0x8dea0de1...` |
| I | GitHub | Repository root |

Hide bookmarks, wallet history, notifications, and any terminal containing keys. Never show `.env` or the disposable wallet's private key.

**Two checks that will ruin a take if skipped.** Confirm Tab B renders an actual offering card, because listings load client side and the server-rendered state reads "No listings yet". Confirm Tab D already has the claim loaded, so Scene 4 needs no typing.

---

## Scene 1 · 0:00–0:22 · Tab A, the landing page

**On screen**

1. Start on the hero with `VERITABLE` visible.
2. Scroll slowly through the three section headings, about seven seconds each: **Bring the proof**, **Make truth contestable**, **Release verified yield**.
3. No wallet connected. This scene shows the product is public.

**Say**

> "Tokenized real world assets can prove a token exists. They cannot prove the asset actually earned the income being paid out. Today, when a platform tells you it collected this month's rent, you are trusting the issuer's word. Veritable makes that income prove itself before anyone gets paid."

**Timing note.** Land "makes that income prove itself" as *Bring the proof* enters frame. Those three headings are your pitch in miniature, so let them do the work.

---

## Scene 2 · 0:22–0:45 · Tab B, the marketplace

**On screen**

1. Show **Property offerings** with a live offering card in the middle of frame.
2. Hover the card once so it reads as interactive.
3. Scroll down far enough to reveal **Your holdings**, then stop.

**Say**

> "This is a live property offering on BOT Chain. Anyone can browse it without connecting a wallet, and anyone can invest. Investors hold a token that entitles them to a share of the rent. The question every one of them should ask is simple: did the rent actually arrive?"

**Cut when** the question lands. Do not click into the offering.

---

## Scene 3 · 0:45–1:20 · Tab C, the Report job

Header reads **Prove the yield, then get paid.**

**On screen**

1. Click **Download sample** and show the file arriving. Using the shipped sample keeps this honest and repeatable.
2. Upload that same file into the evidence field.
3. Type the period and amount. Type, do not paste. Typing reads as real.
4. Advance to escrow and trigger the wallet prompt. **Hold the popup on screen for two full seconds.**
5. Cut before the transaction confirms.

**Say**

> "Here an issuer reports income. They upload the lease statement and point to the payment. But nothing is distributed yet. The money goes into escrow, and the claim goes to verification. This is the firewall. Reporting income and receiving money are now two different events."

**Why the two second hold.** That single frame is your proof of wallet interaction, which is a hard submission requirement. Do not rush past it.

---

## Scene 4 · 1:20–1:55 · Tab D, the Track job

Claim `0x1b547def2d1d6be5c508e357650fdd7366bd21b1b44ceb11c4e503b6d7a69c1a`, already loaded.

**On screen**

1. Expand the rule list.
2. **Hold completely still on all eight rules.** Do not scroll while speaking.
3. Finish on the VERIFIED outcome and the released amount.

```
PASS  AI_EXTRACTION_PRESENT
PASS  AI_TERMS_MATCH
PASS  SOURCE_PROOF_VALID
PASS  SOURCE_RECORD_FRESH
PASS  PAYMENT_PRESENT
PASS  AMOUNT_MATCHES
PASS  PAYER_MATCHES
PASS  DATE_IN_WINDOW
```

**Say**

> "An AI model reads the document and extracts the amount and the due date. It does not decide anything. Eight deterministic rules decide. The extracted terms have to match what was registered. A real on chain payment has to exist, from the right payer, for the right amount, inside the right window. All eight pass, so this claim is verified, and exactly the escrowed amount is released."

**Why stillness matters.** Let the viewer read three or four rule names themselves. The two AI rules at the top are what separate this from every submission that just calls an LLM.

---

## Scene 5 · 1:55–2:30 · Tabs E, F, G, the climax

Roughly ten seconds per tab. This is the longest block in the video and the only part a competitor probably cannot show.

**On screen and what to say, in order**

1. **Tab E, the challenge.**
   > "Now the case that matters. Here a verifier approved a claim that was false. Anyone can challenge an attestation during the public window. A challenger did."

2. **Tab F, the overturn and slash.** Stop moving the mouse entirely.
   > "The resolver overturned it. The verifier lost two BOT of its own stake."

   Then, slowly:
   > "The verifier lost its own money for being wrong."

   **Stay silent for a full second.**

3. **Tab G, the refund.**
   > "Investors received nothing, and the blocked escrow went back to the issuer. That is the difference between an AI that gives an opinion and an AI that is financially accountable for it."

**Non negotiable.** Say the word "intentional" at least once across this scene. This must read as an adversarial test your team ran, never as a live failure.

---

## Scene 6 · 2:30–2:50 · Tab H, Mainnet

**On screen**

1. Show `scan.botchain.ai` with the attestation registry loaded, so a real mainnet address with bytecode is visible.
2. Cut to `deployments/bot-mainnet/manifest.json`, scrolled to the `roles` block. Five distinct addresses on screen at once makes the point with no contract calls to fumble.

**Say**

> "Veritable is deployed on BOT Chain Mainnet. The temporary deployer renounced every admin role after setup, so admin, guardian, resolver and verifier sit on four separate addresses. The verifier is bonded with real BOT before it can attest to anything."

Then, plainly, in the same breath:

> "The walkthrough you just saw runs on Testnet, where the full evidence history lives. The protocol itself is deployed on Mainnet."

**Do not skip that second line.** Misrepresented materials are a disqualification risk, and the real story does not need the help.

---

## Scene 7 · 2:50–3:00 · Tab I, close

**On screen**

1. Repository root.
2. Cut to the live URL.
3. Stop recording on the last word. No outro card, no music sting, no thank-you slide.

**Say**

> "Sixty automated tests, forty six live checks against the deployed chain, and every claim in the README backed by a transaction. Veritable. Proof of income before distribution."

---

## The one line to land

If only one sentence survives the edit, make it this one, over the slash in Scene 5:

> *"The verifier lost its own money for being wrong."*

Everything else in the product exists to make that sentence true.

---

## Delivery notes

- Speak slowly. Two and a half clean minutes beats three rushed ones.
- Show at least one full transaction hash unblurred.
- Use a fresh browser profile for Scenes 1 and 2.
- If a Mainnet claim settles before you record, replace Scene 6 with that settlement and drop the Testnet disclaimer for that scene only.

## Do not claim

Bank connectivity, KYC, AML, legal title verification, or a secondary market. None are built. The payment rail is an on chain transfer plus a live model extraction, and that is a strong enough story on its own.

---

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
