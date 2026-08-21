# Demo recording script

Target **2:45-3:00**. Record at 1920x1080, browser zoom near 100%. Read this top to bottom while recording. Each scene gives you the tab, the actions, and the exact words.

Tone is a business pitch, not a code walkthrough. The viewer is a judge who has already watched twenty submissions today.

---

## Before you press record

Open these nine tabs and leave them loaded. Switching tabs on camera is fine. Waiting for a page to load is not.

| Tab | URL | Pre-state |
|---|---|---|
| A | `https://veritable-mainnet.vercel.app` | Logged out, scrolled to top |
| B | Mainnet public report URL | VERIFIED claim loaded |
| C | `scan.botchain.ai/tx/0x4cb04a9b...` | Mainnet income payment |
| D | `https://veritable-mainnet.vercel.app/app` | Track job with Mainnet claim loaded |
| E | `scan.bohr.life/tx/0x275cf40d...` | Challenge |
| F | `scan.bohr.life/tx/0x82318cab...` | Overturn and slash |
| G | `scan.bohr.life/tx/0x32f1a7af...` | Refund |
| H | `scan.botchain.ai/tx/0x30bda9d8...` | Mainnet settlement, with withdrawal links ready |
| I | GitHub | Repository root |

Hide bookmarks, wallet history, notifications, and any terminal containing keys. Never show `.env` or the disposable wallet's private key.

**Two checks that will ruin a take if skipped.** Confirm Tab B shows HTTP 200 and the VERIFIED report. Confirm Tab D already has the Mainnet claim loaded, so Scene 4 needs no typing.

---

## Scene 1: 0:00-0:22, Tab A, the landing page

**On screen**

1. Start on the hero with `VERITABLE` visible.
2. Scroll slowly through the three section headings, about seven seconds each: **Bring the proof**, **Make truth contestable**, **Release verified yield**.
3. No wallet connected. This scene shows the product is public.

**Say**

> "Tokenized real world assets can prove a token exists. They cannot prove the asset actually earned the income being paid out. Today, when a platform tells you it collected this month's rent, you are trusting the issuer's word. Veritable makes that income prove itself before anyone gets paid."

**Timing note.** Land "makes that income prove itself" as *Bring the proof* enters frame. Those three headings are your pitch in miniature, so let them do the work.

---

## Scene 2: 0:22-0:45, Tab B, the Mainnet report

**On screen**

1. Show claim `0xfbe58b...aebd8` and the VERIFIED outcome.
2. Show `10000` verified minor units and all eight PASS results.
3. Pause on the attestation identifier.

**Say**

> "This is a live BOT Chain Mainnet claim settled in official USDT. DeepSeek extracted the document facts, but eight deterministic rules decided whether the income was real enough to release. Every rule passed."

**Cut when** the question lands. Do not click into the offering.

---

## Scene 3: 0:45-1:20, Tab C, the Mainnet payment

**On screen**

1. Show the complete Mainnet income-payment transaction hash.
2. Point to official USDT and `10000` minor units, equal to `0.010000 USDT`.
3. Cut to the bonded attestation transaction.

**Say**

> "The payer moved exactly one cent of official USDT on Mainnet. That transaction became evidence, not an automatic approval. The issuer still had to escrow the claim, the verifier had to bond BOT, and the rules had to agree before settlement."

---

## Scene 4: 1:20-1:55, Tab D, the Track job

Claim `0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8`, already loaded.

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

## Scene 5: 1:55-2:30, Tabs E, F, G, the climax

Roughly ten seconds per tab. This is the longest block in the video and the only part a competitor probably cannot show.

**On screen and what to say, in order**

1. **Tab E, the challenge.**
   > "Now the case that matters. Here a verifier intentionally approved a claim that was false. Anyone can challenge an attestation during the public window. A challenger did."

2. **Tab F, the overturn and slash.** Stop moving the mouse entirely.
   > "The resolver overturned it. The verifier lost two BOT of its own stake."

   Then, slowly:
   > "The verifier lost its own money for being wrong."

   **Stay silent for a full second.**

3. **Tab G, the refund.**
   > "Investors received nothing, and the blocked escrow went back to the issuer. That is the difference between an AI that gives an opinion and an AI that is financially accountable for it."

**Non negotiable.** Say the word "intentional" at least once across this scene. This must read as an adversarial test your team ran, never as a live failure.

---

## Scene 6: 2:30-2:50, Tab H, Mainnet

**On screen**

1. Show the Mainnet settlement transaction.
2. Show the issuer withdrawal of `0.006000 USDT` and payer withdrawal of `0.004000 USDT`.

**Say**

> "After the full 600-second challenge window, the unchallenged attestation settled. The vault released exactly six thousand minor units to the issuer and four thousand to the second holder. Six plus four equals ten thousand. No dust, and no distribution before proof."

---

## Scene 7: 2:50-3:00, Tab I, close

**On screen**

1. Repository root.
2. Cut to the live URL.
3. Stop recording on the last word. No outro card, no music sting, no thank-you slide.

**Say**

> "Ninety one automated tests, forty six live Testnet checks, and a complete official-USDT Mainnet settlement. Veritable. Proof of income before distribution."

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
- Keep the Testnet challenge, slash, and refund sequence because it proves the adversarial path that was not repeated with real Mainnet funds.

## Do not claim

Bank connectivity, KYC, AML, legal title verification, or a secondary market. None are built. The payment rail is an on chain transfer plus a live model extraction, and that is a strong enough story on its own.

---

## Reference facts, all verifiable

| Claim | Evidence |
|---|---|
| Mainnet canonical claim, eight rules, VERIFIED | `0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8` |
| Live model extraction | provider run `68579132-c454-414c-be85-a1d4fc4a4e28` |
| Mainnet income payment | https://scan.botchain.ai/tx/0x4cb04a9b2cb9e2c99e4ca31e59729187fa850f6bcf7214b60a709eb1094d7056 |
| Mainnet bonded attestation | https://scan.botchain.ai/tx/0x6494c68dce64e62e214226dfa0488a7c4d79232cec24e679fce24f6ed0ff44dc |
| Mainnet settlement | https://scan.botchain.ai/tx/0x30bda9d8b5701c3f1e1a45b22376a85d9c7caf302fa2a0209b33b0877a45ce28 |
| Mainnet 60/40 withdrawals | `0x2c52ec0a60ce029f9d6d9f0cf7d32f9b01a42397811e43ddf91984c4c0e85a7e`, `0x6ac4083304867ce5ef9605ba145b7d9a91cf9b91e02e0738da1ad16faed87d81` |
| Challenge | https://scan.bohr.life/tx/0x275cf40d0ffba0a2ee6bfd5a1e489276516bdcb5f1c14ddc66136e14bd77d73a |
| Overturn and slash, 5 to 3 tBOT | https://scan.bohr.life/tx/0x82318cab75659f149e73b575848befc7c65ff2954a3ac67f0b966d7b699afb56 |
| Blocked escrow refunded, 1,500 USDT | https://scan.bohr.life/tx/0x32f1a7afffacd1b55ad67bfe1c67f5f57af6f170422cf5b9d4917514f33264b1 |
| Mainnet deployment, chain 677 | `deployments/bot-mainnet/manifest.json`, block 20300480 |
| Mainnet role separation | deployer holds `DEFAULT_ADMIN_ROLE` on none of the four core contracts |
| Test and audit counts | 91 tests, 46 of 46 live Testnet checks |
